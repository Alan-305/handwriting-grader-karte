from flask import Flask

from app.config import Config
from app.extensions import cors, init_firebase


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    from app.ai.gemini_client import normalize_gemini_model

    app.config["GEMINI_MODEL"] = normalize_gemini_model(app.config.get("GEMINI_MODEL"))

    cors.init_app(
        app,
        resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}},
        supports_credentials=True,
    )

    if app.config["FIREBASE_PROJECT_ID"]:
        init_firebase(app)

    from app.routes.analysis import analysis_bp
    from app.routes.grading import grading_bp
    from app.routes.health import health_bp
    from app.routes.image import image_bp
    from app.routes.past_exam import past_exam_bp
    from app.routes.question_design import question_design_bp
    from app.routes.upload import upload_bp

    app.register_blueprint(health_bp, url_prefix="/api")
    app.register_blueprint(upload_bp, url_prefix="/api")
    app.register_blueprint(image_bp, url_prefix="/api")
    app.register_blueprint(grading_bp, url_prefix="/api")
    app.register_blueprint(analysis_bp, url_prefix="/api")
    app.register_blueprint(past_exam_bp, url_prefix="/api")
    app.register_blueprint(question_design_bp, url_prefix="/api")

    @app.get("/")
    def root():
        from flask import jsonify

        return jsonify(
            {
                "service": "handwriting-grader-karte-api",
                "message": "This is the API server only. Open the app at http://localhost:5173",
                "api_health": "/api/health",
            }
        )

    return app
