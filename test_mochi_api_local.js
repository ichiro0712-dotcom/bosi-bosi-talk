fetch('http://localhost:3000/api/mochi', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: "test", userId: "user_a", userName: "ミルク" })
}).then(async r => {
  console.log("Status:", r.status);
  console.log("Body:", await r.text());
}).catch(e => console.error("Error:", e));
