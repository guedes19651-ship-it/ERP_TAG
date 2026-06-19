const fs = require('fs');
const files = fs.readdirSync('.').filter(f => f.endsWith('.html'));
let countEdit = 0;
let countDel = 0;

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  
  let newContent = content.replace(/(<button[^>]*class="[^"]*btn-edit[^"]*"[^>]*>)(.*?)(<\/button>)/gi, (m, p1, p2, p3) => {
    countEdit++;
    return p1 + '✏️' + p3;
  });
  
  newContent = newContent.replace(/(<button[^>]*class="[^"]*btn-del[^"]*"[^>]*>)(.*?)(<\/button>)/gi, (m, p1, p2, p3) => {
    countDel++;
    return p1 + '🗑️' + p3;
  });
  
  if (content !== newContent) {
    fs.writeFileSync(f, newContent);
  }
});

console.log('Edits replaced: ' + countEdit + ', Dels replaced: ' + countDel);
