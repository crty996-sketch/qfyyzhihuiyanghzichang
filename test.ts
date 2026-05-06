async function run() {
  const res = await fetch('http://localhost:3000/api/records/loss');
  const data = await res.json();
  console.log("loss RECORDS:", JSON.stringify(data, null, 2));
}
run();
