from app.services.error_tags import (
    categorize_error_tag,
    normalize_error_tag,
)


def test_normalize_strips_fullwidth_paren():
    assert normalize_error_tag("指示未達（テーマへの適合不足）") == "指示未達"


def test_normalize_strips_halfwidth_paren():
    assert normalize_error_tag("訳し漏れ（even is established）") == "訳し漏れ"


def test_categorize_test_specific_to_general():
    assert categorize_error_tag("自己抑制原理への言及なし") == "具体性不足"
    assert categorize_error_tag("指示未達（テーマへの適合不足）") == "指示未達"
    assert categorize_error_tag("訳し漏れ（even is established）") == "訳し漏れ"


def test_categorize_already_general():
    assert categorize_error_tag("語彙ミス") == "語彙ミス"
    assert categorize_error_tag("構造把握の弱さ") == "構造把握の弱さ"


def test_categorize_word_order():
    assert categorize_error_tag("語順の逆転") == "語順・表現"


def test_categorize_unknown():
    assert categorize_error_tag("謎のタグ") == "その他"
