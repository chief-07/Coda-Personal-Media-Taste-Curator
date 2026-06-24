import os, json

pending_dir = r"c:\Users\USER\Documents\Coda\backend\data\pending_synthesis"

files = [f for f in os.listdir(pending_dir) if f.endswith('.json')]
files = files[:5]

if not files:
    print("NO_MORE_FILES")
    exit(0)

for f in files:
    old_path = os.path.join(pending_dir, f)
    new_path = old_path + ".processing"
    os.rename(old_path, new_path)
    
    with open(new_path, 'r', encoding='utf-8') as file:
        data = json.load(file)
        
    print(f"--- FILE: {new_path} ---")
    print(f"UUID: {data.get('uuid')}")
    print(f"Title: {data.get('title')}")
    sd = data.get('structured_data', {})
    for k, v in sd.items():
        if k != 'image' and k != 'link':
            print(f"{k}: {v}")
    print("Snippets:")
    snippets = data.get('community_snippets', [])[:7]
    for s in snippets:
        print(f"- {s.get('snippet')}")
    print("\n" + "="*40 + "\n")
