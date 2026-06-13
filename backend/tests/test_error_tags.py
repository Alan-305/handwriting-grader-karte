from app.services.error_tags import (
    GENERALIZED_ERROR_CATEGORIES,
    categorize_error_tag,
    normalize_error_tag,
)


def test_categories_ordered_by_severity():
    assert GENERALIZED_ERROR_CATEGORIES[0] == "誤情報の混入"
    assert GENERALIZED_ERROR_CATEGORIES[-1] == "その他"


def test_normalize_strips_fullwidth_paren():
    assert normalize_error_tag("内容説明不足（論点が浅い）") == "内容説明不足"


def test_categorize_legacy_tags():
    assert categorize_error_tag("訳し漏れ（even is established）") == "誤訳・脱訳"
    assert categorize_error_tag("時制ミス") == "時制・仮定法・助動詞"
    assert categorize_error_tag("具体性不足") == "内容説明不足"
    assert categorize_error_tag("構造把握の弱さ") == "句・節の把握ミス"
    assert categorize_error_tag("指示未達") == "その他"


def test_categorize_new_skill_tags():
    assert categorize_error_tag("修飾先の取り違え") == "修飾先の取り違え"
    assert categorize_error_tag("該当段落の取り違え") == "該当箇所のズレ"
    assert categorize_error_tag("誤った情報が混入") == "誤情報の混入"
    assert categorize_error_tag("説明が不十分") == "内容説明不足"
    assert categorize_error_tag("仮定法の訳出ミス") == "時制・仮定法・助動詞"


def test_categorize_free_text_to_general():
    assert categorize_error_tag("自己抑制原理への言及なし") == "内容説明不足"
    assert categorize_error_tag("語順の逆転") == "文構造の誤り"
    assert categorize_error_tag("構文の取り違え") == "文構造の誤り"


def test_categorize_unknown():
    assert categorize_error_tag("謎のタグ") == "その他"
