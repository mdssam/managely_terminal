import os
import glob

klik_api_dir = "/home/abeddy/techstation-meta/apps/klik_pos/klik_pos/api"
sultan_api_dir = "/home/abeddy/techstation-meta/apps/sultan/sultan/sultan/api"

if not os.path.exists(sultan_api_dir):
    os.makedirs(sultan_api_dir)
    print(f"Created {sultan_api_dir}")

# Step 1: Rename api.py to __init__.py if it still exists as a file
old_api_file = "/home/abeddy/techstation-meta/apps/sultan/sultan/sultan/api.py"
init_file = os.path.join(sultan_api_dir, "__init__.py")
if os.path.exists(old_api_file) and not os.path.exists(init_file):
    import shutil
    shutil.move(old_api_file, init_file)
    print(f"Moved api.py to {init_file}")

# Step 2: Loop through all .py files in klik_pos api directory and generate stubs
for py_file in glob.glob(os.path.join(klik_api_dir, "*.py")):
    basename = os.path.basename(py_file)
    if basename == "__init__.py":
        continue
        
    module_name = basename.replace(".py", "")
    
    # Read content to find all function names that are whitelisted (heuristic)
    functions = []
    with open(py_file, 'r') as f:
        lines = f.readlines()
        for i, line in enumerate(lines):
            if "@frappe.whitelist(" in line or "@frappe.whitelist()" in line:
                # The next non-empty non-comment line should be the function
                j = i + 1
                while j < len(lines):
                    content = lines[j].strip()
                    if content.startswith("def "):
                        func_name = content.split("def ")[1].split("(")[0].split(":")[0].strip()
                        functions.append(func_name)
                        break
                    if content and not content.startswith("#") and not content.startswith("@"):
                         # Safety break if something else shows up
                         break
                    j += 1
    
    if not functions:
        # Skip empty modules
        continue
        
    # Create stub file
    stub_path = os.path.join(sultan_api_dir, basename)
    with open(stub_path, 'w') as out:
        out.write(f"# Auto-generated stubs forwarding from klik_pos.api.{module_name}\n")
        out.write("import frappe\n")
        out.write(f"from klik_pos.api.{module_name} import (\n")
        for func in functions:
            out.write(f"    {func},\n")
        out.write(")\n\n")
        out.write("# End of auto-generated file\n")
    
    print(f"Generated {stub_path} with {len(functions)} functions.")
