import pytest

from app.services.past_exam_service import ImportSources, PastExamService


def test_question_doc_id_major_only():
    assert PastExamService._question_doc_id(1, None) == "1"
    assert PastExamService._question_doc_id(4, None) == "4"


def test_question_doc_id_with_part():
    assert PastExamService._question_doc_id(2, "(1)") == "2_1"
    assert PastExamService._question_doc_id(2, "(3)") == "2_3"


def test_guess_archetype_composition():
    assert PastExamService._guess_archetype("english", "80語の英作文") == "english_composition"


def test_infer_answer_format_japanese_summary():
    prompt = "1 (A) 以下の英文を読み、その内容を 70〜80 字の日本語で要約せよ。"
    assert PastExamService._infer_answer_format(prompt) == "japanese_writing"


def test_infer_answer_format_symbol():
    prompt = "マークシートの (1)〜(5) にその記号をマークせよ。"
    assert PastExamService._infer_answer_format(prompt) == "symbol"


def test_infer_answer_format_english_composition():
    prompt = "60〜80 語の英語で答えよ。"
    assert PastExamService._infer_answer_format(prompt) == "english_writing"


def test_grading_type_for_japanese_writing_on_english_exam():
    assert PastExamService._grading_type_for("japanese_writing", "英語") == "english"


def test_guess_archetype_summary():
    prompt = "70〜80 字の日本語で要約せよ"
    assert (
        PastExamService._guess_archetype("english", prompt, answer_format="japanese_writing")
        == "japanese_summary"
    )


def test_extract_text_missing_file():
    from app.services.pdf_text_extractor import extract_text_from_pdf

    with pytest.raises(FileNotFoundError):
        extract_text_from_pdf("/nonexistent/exam.pdf")


def test_extract_text_from_pdfs_requires_paths():
    from app.services.pdf_text_extractor import extract_text_from_pdfs

    with pytest.raises(ValueError):
        extract_text_from_pdfs([])


def test_discover_sources_with_temp_folder(tmp_path, monkeypatch):
    service = PastExamService()
    year_dir = tmp_path / "universities" / "todai" / "2026"
    year_dir.mkdir(parents=True)
    (year_dir / "exam_02.pdf").write_bytes(b"%PDF-1.4 minimal")
    (year_dir / "exam_01.pdf").write_bytes(b"%PDF-1.4 minimal")
    (year_dir / "answers.pdf").write_bytes(b"%PDF-1.4 minimal")

    monkeypatch.setattr(service, "year_dir", lambda _slug, _year: year_dir)
    sources = service.discover_sources("todai", 2026)

    assert [p.name for p in sources.exam_pdfs] == ["exam_01.pdf", "exam_02.pdf"]
    assert sources.answers_pdf.name == "answers.pdf"


def test_resolve_sources_auto_discovers_japanese_filenames(tmp_path, monkeypatch):
    service = PastExamService()
    year_dir = tmp_path / "universities" / "todai" / "2026"
    year_dir.mkdir(parents=True)
    (year_dir / "2026東大問題.pdf").write_bytes(b"%PDF-1.4")
    (year_dir / "2026東大解答.pdf").write_bytes(b"%PDF-1.4")

    monkeypatch.setattr(service, "year_dir", lambda _slug, _year: year_dir)
    sources = service.resolve_sources("todai", 2026)

    assert sources.exam_pdfs[0].name == "2026東大問題.pdf"
    assert sources.answers_pdf is not None
    assert sources.answers_pdf.name == "2026東大解答.pdf"


def test_is_listening_pdf():
    from app.services.past_exam_service import _is_listening_pdf
    from pathlib import Path

    assert _is_listening_pdf(Path("2026東大リスニング.pdf"))
    assert _is_listening_pdf(Path("listening.pdf"))
    assert not _is_listening_pdf(Path("2026東大問題.pdf"))


def test_is_analysis_pdf():
    from app.services.past_exam_service import _is_analysis_pdf
    from pathlib import Path

    assert _is_analysis_pdf(Path("2026東大分析シート.pdf"))
    assert _is_analysis_pdf(Path("analysis.pdf"))
    assert not _is_analysis_pdf(Path("2026東大問題.pdf"))
    assert not _is_analysis_pdf(Path("2026東大解答.pdf"))


def test_discover_sources_finds_listening(tmp_path, monkeypatch):
    service = PastExamService()
    year_dir = tmp_path / "universities" / "todai" / "2026"
    year_dir.mkdir(parents=True)
    (year_dir / "2026東大問題.pdf").write_bytes(b"%PDF-1.4")
    (year_dir / "2026東大解答.pdf").write_bytes(b"%PDF-1.4")
    # macOS NFD: ク + 結合濁点 = グ
    nfd_name = "2026東大リスニン\u30af\u3099.pdf"
    (year_dir / nfd_name).write_bytes(b"%PDF-1.4")

    monkeypatch.setattr(service, "year_dir", lambda _slug, _year: year_dir)
    sources = service.discover_sources("todai", 2026)

    assert sources.listening_pdf is not None
    assert sources.answers_pdf is not None
    assert len(sources.exam_pdfs) == 1
    assert "問題" in sources.exam_pdfs[0].name


def test_import_session_roundtrip(tmp_path, monkeypatch):
    from app.ai.schemas.past_exam import ParsedPastQuestion, PastExamParseResponse

    service = PastExamService()
    session_root = tmp_path / ".import-sessions"
    monkeypatch.setattr(service, "import_session_dir", lambda session_id: session_root / session_id)

    exam_pdf = tmp_path / "exam.pdf"
    exam_pdf.write_bytes(b"%PDF-1.4")
    sources = service.build_sources_from_paths([exam_pdf])
    parsed = PastExamParseResponse(
        year=2027,
        questions=[
            ParsedPastQuestion(majorOrder=1, type="english", prompt="Sample prompt", modelAnswer="Sample answer")
        ],
    )

    session_id = service.create_import_session(
        university_slug="todai",
        year=2027,
        sources=sources,
        parsed=parsed,
    )

    slug, year, loaded_parsed, loaded_sources = service.load_import_session(session_id)
    assert slug == "todai"
    assert year == 2027
    assert len(loaded_parsed.questions) == 1
    assert loaded_sources.exam_pdfs[0].name == "exam.pdf"

    service.delete_import_session(session_id)
    assert not (session_root / session_id).exists()
