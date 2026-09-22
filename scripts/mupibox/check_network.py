import requests


def internet():
    try:
        response = requests.get("https://www.google.com", timeout=5)
        return response.status_code == 200
    except requests.RequestException:
        return False


def main():
    return 0 if internet() else 1


if __name__ == "__main__":
    raise SystemExit(main())
