from app.services.question_type_labels import format_type_label, type_key


def test_format_type_label_with_part():
    assert format_type_label(1, "(A)") == "第1問(A)"
    assert format_type_label(3, "(B)") == "第3問(B)"


def test_format_type_label_major_only():
    assert format_type_label(4, None) == "第4問"
    assert format_type_label(5, "本文") == "第5問"


def test_type_key():
    assert type_key(1, "(A)") == "1:(A)"
    assert type_key(2, None) == "2:"
