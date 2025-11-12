# robot_ws_client.py
import asyncio, json, time, websockets  # pip install websockets

WS_BASE  = "ws://localhost:8080/ws"        # адрес твоего сервера
TOKEN    = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhcnNlbiIsImlhdCI6MTc2MjkwNDI0MiwiZXhwIjoxNzYzNTA5MDQyfQ.l_fG5Isgcgm2KZIv04kdfyE5y0mqixnLIRCJj1__Si0"                     # access_token из /auth/login
ROBOT_ID = "r1"

async def robot():
    uri = f"{WS_BASE}?role=robot&robot_id={ROBOT_ID}&token={TOKEN}"
    while True:
        try:
            print("[WS] connecting:", uri)
            async with websockets.connect(uri, ping_interval=20, ping_timeout=20) as ws:
                print("[WS] robot online:", ROBOT_ID)
                # опционально: сказать серверу свою готовность
                await ws.send(json.dumps({"type":"hello","robot_id":ROBOT_ID,"ts":time.time()}))
                async for raw in ws:
                    try:
                        msg = json.loads(raw) if isinstance(raw, str) else {}
                    except Exception:
                        msg = {}
                    # ожидаем {"action":"up|down|left|right|stop","speed":0..100}
                    print("CMD:", msg)
                    # TODO: здесь дерни GPIO/Motor driver
                    # отвечаем ack
                    await ws.send(json.dumps({"type":"ack","action":msg.get("action"),"ts":time.time()}))
        except Exception as e:
            print("[WS] error:", e)
            await asyncio.sleep(2)  # реконнект

if __name__ == "__main__":
    asyncio.run(robot())

