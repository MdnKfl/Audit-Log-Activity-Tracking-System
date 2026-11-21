async function main() {
  const total = Number(process.argv[2]) || 200;
  const start = Date.now();

  const statuses = await Promise.all(
    Array.from({ length: total }, (_, i) =>
      fetch('http://localhost:3000/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': `user-${i % 10}` },
        body: JSON.stringify({ name: `Client ${i}` }),
      }).then((r) => r.status),
    ),
  );

  console.log(`${total} requests answered in ${Date.now() - start} ms`);
  console.log('201 responses:', statuses.filter((s) => s === 201).length);
}
main();