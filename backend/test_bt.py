from fastapi import FastAPI, BackgroundTasks
app = FastAPI()
@app.post('/')
def test(bt: BackgroundTasks = BackgroundTasks()):
    bt.add_task(print, 'hello')
    return 'ok'

if __name__ == "__main__":
    from fastapi.testclient import TestClient
    print(TestClient(app).post('/').json())
