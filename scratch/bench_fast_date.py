"""Benchmark: old strptime vs new regex-based parse_date on 200k rows."""
import time, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from parsers.generic_parser import parse_date

# Simulate 200k date strings in DD/MM/YYYY format (most common Indian bank)
dates = [f"{(i%28)+1:02d}/{(i%12)+1:02d}/2024" for i in range(200_000)]

# Also include some empties and text (like real bank data has)
mixed = []
for i, d in enumerate(dates):
    if i % 20 == 0:
        mixed.append("")  # Empty row (skip fast)
    elif i % 50 == 0:
        mixed.append("Opening Balance")  # Text row (skip fast)
    else:
        mixed.append(d)

print(f"Benchmarking parse_date on {len(mixed)} rows...")
start = time.perf_counter()
parsed = 0
for s in mixed:
    result = parse_date(s)
    if result:
        parsed += 1
elapsed = time.perf_counter() - start
print(f"  Parsed {parsed} dates in {elapsed:.3f}s")
print(f"  Rate: {len(mixed)/elapsed:,.0f} rows/sec")
print(f"  Per-row: {elapsed/len(mixed)*1e6:.1f} µs")

# Also test DD-Mon-YYYY format
dates2 = [f"{(i%28)+1:02d}-Jun-2024" for i in range(200_000)]
start2 = time.perf_counter()
p2 = sum(1 for d in dates2 if parse_date(d))
e2 = time.perf_counter() - start2
print(f"\nDD-Mon-YYYY: {p2} dates in {e2:.3f}s ({len(dates2)/e2:,.0f} rows/sec)")
