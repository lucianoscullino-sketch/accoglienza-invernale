import os
content = open('components/App.tsx', 'r').read()
old = '                    ) : null}\n                    </button>\n                    <button className="btn btn-sm" type="button" onClick={() => reject(p)}>'
new = '                    ) : null}\n                    <button className="btn btn-sm" type="button" onClick={() => reject(p)}>'
if old in content:
    content = content.replace(old, new)
    open('components/App.tsx', 'w').write(content)
    print('Modified')
else:
    print('Not found')
