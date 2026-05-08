import sys
sys.path.insert(0, '.')
from app.services import data_service
import inspect

src = inspect.getsource(data_service._normalize_market_overview)
print("Has aspi_value:", "aspi_value" in src)
print()
# Show the return block
lines = src.split("\n")
in_return = False
for line in lines:
    if "return {" in line:
        in_return = True
    if in_return:
        print(line)
    if in_return and line.strip() == "}":
        break
