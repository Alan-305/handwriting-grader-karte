"""② 準備フェーズ: セット下書きパイプライン（build_test_draft）の検証。

Gemini / Firestore に依存しないよう、生成・検証・保存をモックして
オーケストレーション（弱点反映・自動リトライ・確定昇格）を確認する。
"""

from app.ai.prompts.question_generation import build_generation_user_prompt
from app.ai.schemas.question_design import GeneratedQuestionItem
from app.services.question_design_service import QuestionDesignService

_SELECTIONS = [{"majorOrder": 1, "partLabel": None, "typeLabel": "第1問"}]


def test_generated_item_parses_anticipated_mistakes():
    item = GeneratedQuestionItem.model_validate(
        {
            "typeLabel": "第1問",
            "majorOrder": 1,
            "prompt": "p",
            "modelAnswer": "a",
            "points": 10,
            "anticipatedMistakes": ["時制ミス", "直訳しすぎ"],
        }
    )
    assert item.anticipated_mistakes == ["時制ミス", "直訳しすぎ"]

    # 文字列でも配列化する
    single = GeneratedQuestionItem.model_validate(
        {"typeLabel": "第1問", "majorOrder": 1, "prompt": "p", "modelAnswer": "a", "anticipatedMistakes": "単一"}
    )
    assert single.anticipated_mistakes == ["単一"]


def test_generation_prompt_includes_weakness_focus_only_when_provided():
    with_focus = build_generation_user_prompt(
        university_name="東大",
        selections=_SELECTIONS,
        reference_context="ctx",
        difficulty="standard",
        topic_hint="",
        count_per_type=1,
        weakness_focus="時制の運用が弱い",
    )
    assert "時制の運用が弱い" in with_focus
    assert "弱点" in with_focus

    without_focus = build_generation_user_prompt(
        university_name="東大",
        selections=_SELECTIONS,
        reference_context="ctx",
        difficulty="standard",
        topic_hint="",
        count_per_type=1,
    )
    assert "弱点" not in without_focus


def test_validity_projection_and_insufficient_detection():
    proj = QuestionDesignService._validity_projection(
        [
            {"type": "english", "prompt": "p1", "modelAnswer": "a1", "points": 12},
            {"prompt": "p2", "modelAnswer": "a2"},
        ]
    )
    assert proj[0] == {
        "order": 1,
        "type": "english",
        "prompt": "p1",
        "modelAnswer": "a1",
        "points": 12,
    }
    assert proj[1]["order"] == 2
    assert proj[1]["points"] == 10  # 既定値

    assert QuestionDesignService._has_insufficient({"items": [{"coverage": "insufficient"}]}) is True
    assert QuestionDesignService._has_insufficient({"items": [{"coverage": "sufficient"}]}) is False
    assert QuestionDesignService._has_insufficient(None) is False


class _FakeRef:
    def __init__(self, _id="draft123"):
        self.id = _id


class _FakeDraftsColl:
    def __init__(self, store):
        self.store = store

    def add(self, doc):
        self.store["doc"] = doc
        return (None, _FakeRef())


def test_build_test_draft_retries_once_when_insufficient(monkeypatch):
    svc = QuestionDesignService.__new__(QuestionDesignService)
    calls = {"gen": 0, "val": 0}
    gen_kwargs: list[dict] = []

    first_items = [
        {"typeLabel": "第1問", "majorOrder": 1, "prompt": "weak", "modelAnswer": "a", "points": 10, "type": "english"}
    ]
    retry_items = [
        {"typeLabel": "第1問", "majorOrder": 1, "prompt": "better", "modelAnswer": "a2", "points": 10, "type": "english"}
    ]

    def fake_gen(**kwargs):
        calls["gen"] += 1
        gen_kwargs.append(kwargs)
        return first_items if calls["gen"] == 1 else retry_items

    def fake_val(**kwargs):
        calls["val"] += 1
        cov = "insufficient" if calls["val"] == 1 else "sufficient"
        return {
            "overallSummary": "ok",
            "universitySlug": "todai",
            "items": [{"questionOrder": 1, "coverage": cov, "improvements": ["長さを揃える"]}],
        }

    store: dict = {}
    monkeypatch.setattr(svc, "_run_generation", fake_gen)
    monkeypatch.setattr(svc, "_validity_for_questions", fake_val)
    monkeypatch.setattr(svc, "_test_drafts_collection", lambda tid: _FakeDraftsColl(store))
    monkeypatch.setattr(svc, "_university_name", lambda slug: "東京大学")

    result = svc.build_test_draft(
        teacher_id="t1", university_slug="todai", selections=_SELECTIONS
    )

    assert calls["gen"] == 2  # 1回だけ自動リトライ
    assert calls["val"] == 2
    assert result["questions"] == retry_items
    assert result["autoRetried"] is True
    assert result["totalPoints"] == 10
    assert result["id"] == "draft123"
    # 改善要望が再生成のヒントに反映される
    assert "長さを揃える" in gen_kwargs[1]["topic_hint"]
    # 必ず下書き・レビュー待ちで保存
    assert store["doc"]["status"] == "draft"
    assert store["doc"]["reviewStatus"] == "draft"


def test_build_test_draft_reflects_student_weakness(monkeypatch):
    svc = QuestionDesignService.__new__(QuestionDesignService)
    gen_kwargs: list[dict] = []

    monkeypatch.setattr(
        svc,
        "_latest_karte_weakness",
        lambda sid, tid: ("時制が不安定", {"name": "山田"}),
    )

    def fake_gen(**kwargs):
        gen_kwargs.append(kwargs)
        return [
            {"typeLabel": "第1問", "majorOrder": 1, "prompt": "p", "modelAnswer": "a", "points": 10, "type": "english"}
        ]

    monkeypatch.setattr(svc, "_run_generation", fake_gen)
    monkeypatch.setattr(
        svc,
        "_validity_for_questions",
        lambda **k: {"overallSummary": "ok", "universitySlug": "todai", "items": [{"questionOrder": 1, "coverage": "sufficient", "improvements": []}]},
    )
    monkeypatch.setattr(svc, "_test_drafts_collection", lambda tid: _FakeDraftsColl({}))
    monkeypatch.setattr(svc, "_university_name", lambda slug: "東京大学")

    result = svc.build_test_draft(
        teacher_id="t1",
        university_slug="todai",
        selections=_SELECTIONS,
        student_id="s1",
    )

    assert result["studentName"] == "山田"
    assert result["weaknessFocus"] == "時制が不安定"
    assert "山田" in result["title"]
    # 弱点フォーカスが生成に渡る
    assert gen_kwargs[0]["weakness_focus"] == "時制が不安定"


def test_promote_test_draft_creates_test_with_all_questions(monkeypatch):
    svc = QuestionDesignService.__new__(QuestionDesignService)
    draft = {
        "id": "d1",
        "title": "セットA",
        "universitySlug": "todai",
        "questions": [
            {"type": "english", "prompt": "p1", "modelAnswer": "a1", "points": 10},
            {"type": "english", "prompt": "p2", "modelAnswer": "a2", "points": 15},
        ],
    }
    monkeypatch.setattr(svc, "get_test_draft", lambda tid, did: draft)

    saved_q: list[dict] = []
    saved_test: dict = {}

    class FakeQDoc:
        def set(self, data):
            saved_q.append(data)

    class FakeQColl:
        def document(self):
            return FakeQDoc()

    class FakeTestRef:
        id = "test1"

        def collection(self, _name):
            return FakeQColl()

        def set(self, data):
            saved_test.update(data)

    class FakeTestsColl:
        def document(self):
            return FakeTestRef()

    class FakeDB:
        def collection(self, _name):
            return FakeTestsColl()

    class FakeFirebase:
        def db(self):
            return FakeDB()

    svc.firebase = FakeFirebase()

    updates: dict = {}

    class FakeDraftDoc:
        def update(self, data):
            updates.update(data)

    class FakeDraftColl:
        def document(self, _did):
            return FakeDraftDoc()

    monkeypatch.setattr(svc, "_test_drafts_collection", lambda tid: FakeDraftColl())

    result = svc.promote_test_draft_as_new_test(teacher_id="t1", draft_id="d1")

    assert result["testId"] == "test1"
    assert result["questionCount"] == 2
    assert len(saved_q) == 2
    assert saved_test["totalPoints"] == 25
    assert saved_test["questionCount"] == 2
    assert updates["status"] == "promoted"
