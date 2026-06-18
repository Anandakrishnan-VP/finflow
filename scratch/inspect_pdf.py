import pdfplumber

with pdfplumber.open("/data/uploads/1e579ae9-b17a-42b8-adb4-9d7437cd4097.pdf") as pdf:
    for i, page in enumerate(pdf.pages):
        print(f"--- PAGE {i} ---")
        print(page.extract_text())
        print(f"--- PAGE {i} TABLES ---")
        tables = page.extract_tables()
        for t in tables:
            for r in t:
                print(r)
