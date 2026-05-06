const fs = require('fs');
let code = fs.readFileSync('src/components/WarehouseManagement.tsx', 'utf8');

code = code.replace(
  /if \(filteredData\.length === 0 && activeLocation === '一级主仓'\) \{/,
  "if (filteredData.length === 0 && activeLocation === '一级主仓' || (filteredData.length === 0 && !activeTank)) {"
);

fs.writeFileSync('src/components/WarehouseManagement.tsx', code);
