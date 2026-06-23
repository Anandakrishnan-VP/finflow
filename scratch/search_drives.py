import os

def search_drives():
    drives = ['C:\\', 'D:\\', 'E:\\']
    target_files = ['officer_brief.py', 'evidence_package.py', 'pdf_generator.py']
    found = []
    
    for drive in drives:
        print(f"Searching drive: {drive}...")
        for root, dirs, files in os.walk(drive):
            # Skip common system folders to avoid infinite loops or permission errors
            if any(p in root.split(os.path.sep) for p in [
                'Windows', 'Program Files', 'Program Files (x86)', 'System Volume Information', 
                '$RECYCLE.BIN', '$Recycle.Bin', 'AppData\\Local\\Microsoft', 'AppData\\Local\\Package Cache'
            ]):
                continue
            
            for file in target_files:
                if file in files:
                    full_path = os.path.join(root, file)
                    print(f"FOUND: {full_path}")
                    found.append(full_path)
                    
    return found

if __name__ == '__main__':
    search_drives()
