const fs = require('fs');
let c = fs.readFileSync('src/components/WarehouseManagement.tsx', 'utf8');
c = c.replace(
  /\) : filteredData\.length === 0 \? \([\s\S]*?\) : \(\(\) => \{/m,
  `) : (() => {
                     if (filteredData.length === 0 && activeLocation === '一级主仓') {
                       return (
                         <tr>
                           <td colSpan={7} className="py-10 text-center text-slate-500">
                              未找到相关物资记录
                           </td>
                         </tr>
                       );
                     }`
);
fs.writeFileSync('src/components/WarehouseManagement.tsx', c);
