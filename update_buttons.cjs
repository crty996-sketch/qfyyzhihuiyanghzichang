const fs = require('fs');
let code = fs.readFileSync('src/components/WarehouseManagement.tsx', 'utf8');

// replace the button className
code = code.replace(
  /className=\{`border rounded-lg p-2 text-center transition-all \$\{activeTank === tank\.id \? 'bg-cyan-500\/20 border-cyan-500' : 'bg-slate-900 border-slate-800 hover:border-slate-700'\}`\}/,
  "className={`relative border rounded-lg p-2 text-center transition-all duration-300 ${activeTank === tank.id ? 'bg-cyan-900/80 border-cyan-400 ring-1 ring-cyan-400/50 shadow-[0_0_15px_rgba(34,211,238,0.3)] scale-[1.02] z-10' : 'bg-slate-900/80 border-slate-800 hover:bg-slate-800/80 hover:border-slate-700'}`}"
);

// We should also look at the "查看全部" button which clears the activeTank
code = code.replace(
  /className=\{`text-\[10px\] font-bold px-2 py-1 rounded transition-colors \$\{!activeTank \? 'bg-cyan-500 text-slate-900' : 'text-slate-500 hover:text-cyan-400 border border-slate-800'\}`\}/,
  "className={`text-[10px] font-bold px-3 py-1 rounded transition-colors ${!activeTank ? 'bg-cyan-500 text-slate-900 shadow-[0_0_10px_rgba(34,211,238,0.4)]' : 'text-slate-500 hover:text-cyan-400 border border-slate-800 hover:border-cyan-500/50'}`}"
);

// We need to verify if the string replacement worked. If it didn't, we will throw an error
if (code.indexOf("ring-1 ring-cyan-400/50") === -1) {
  throw new Error("className replacement for tank button failed!");
}

fs.writeFileSync('src/components/WarehouseManagement.tsx', code);
