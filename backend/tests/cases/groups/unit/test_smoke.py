def test_domain_exception_keeps_message():
    from src.shared.exceptions import NotFound

    assert str(NotFound("шаг")) == "шаг"
