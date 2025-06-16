import datetime
import aiohttp
import os
from opower import Opower  # or wherever it's defined
from opower import AggregateType

USERNAME = "samkortchmar@gmail.com"
PASSWORD = os.getenv("CONED_PASSWORD") or input("ConEd Password: ")
TOTP_SECRET = "QFBUCOQ5UJWQJVF6"  # From your example

async def begin():
    session_cm = aiohttp.ClientSession()
    session = await session_cm.__aenter__()

    api = Opower(session, "coned", USERNAME, PASSWORD, TOTP_SECRET)
    await api.async_login()
    accounts = await api.async_get_accounts()
    return api, accounts

now = datetime.datetime.now()
one_month_ago = now - datetime.timedelta(days=30)
