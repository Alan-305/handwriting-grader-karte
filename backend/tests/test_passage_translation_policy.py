from app.services.passage_translation_policy import (
    is_excluded_from_passage_translation,
    is_passage_translation_target,
)


def test_excludes_q2a_q2b_pipelines():
    assert is_excluded_from_passage_translation({"generationPipeline": "q2a", "order": 2})
    assert is_excluded_from_passage_translation({"generationPipeline": "q2b", "order": 2})


def test_excludes_major_order_3():
    assert is_excluded_from_passage_translation({"order": 3, "type": "english"})


def test_excludes_q2_part_a_b_without_pipeline():
    assert is_excluded_from_passage_translation({"order": 2, "partLabel": "(A)"})
    assert is_excluded_from_passage_translation({"order": 2, "partLabel": "(B)"})


def test_includes_q5_with_english_passage():
    prompt = "Read the passage.\n\n" + ("word " * 60)
    question = {
        "generationPipeline": "q5",
        "order": 5,
        "type": "english",
        "prompt": prompt,
    }
    assert not is_excluded_from_passage_translation(question)
    assert is_passage_translation_target(question)


def test_excludes_q3_even_with_english_passage():
    prompt = "Read the passage.\n\n" + ("word " * 60)
    question = {"order": 3, "type": "english", "prompt": prompt}
    assert is_excluded_from_passage_translation(question)
    assert not is_passage_translation_target(question)
