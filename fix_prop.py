import os
content = open('components/App.tsx', 'r').read()
old = '<button className="btn btn-ok btn-sm" type="button" onClick={() => validate(p)}>\n                       Valida comunque'
new = '{p.status === "pending" ? (\n                       <button className="btn btn-ok btn-sm" type="button" onClick={() => validate(p)}>\n                         Valida comunque\n                       </button>\n                     ) : null}'
if old in content:
    content = content.replace(old, new)
    open('components/App.tsx', 'w').write(content)
    print('Modified')
else:
    print('Not found')
