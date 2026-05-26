"""Session image path helpers for multi-page answer sheets."""

MAX_ANSWER_SHEET_PAGES = 4


def source_image_paths(session: dict) -> list[str]:
    paths = session.get("sourceImagePaths")
    if paths:
        return list(paths)
    single = session.get("sourceImagePath")
    return [single] if single else []


def aligned_image_paths(session: dict) -> list[str]:
    paths = session.get("alignedImagePaths")
    if paths:
        return list(paths)
    single = session.get("alignedImagePath")
    return [single] if single else []
