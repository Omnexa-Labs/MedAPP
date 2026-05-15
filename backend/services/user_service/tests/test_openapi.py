from app.main import app


def test_openapi_examples_use_first_and_last_name():
    schema = app.openapi()

    signup_schema = schema["components"]["schemas"]["SignupRequest"]
    assert signup_schema["examples"][0]["first_name"] == "Amina"
    assert signup_schema["examples"][0]["last_name"] == "Mensah"
    assert "full_name" not in signup_schema["properties"]

    user_update_schema = schema["components"]["schemas"]["UserUpdate"]
    assert user_update_schema["examples"][0]["first_name"] == "Amina"
    assert user_update_schema["examples"][0]["last_name"] == "Mensah"