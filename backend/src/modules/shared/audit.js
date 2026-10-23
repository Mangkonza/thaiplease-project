async function writeAudit(client, { actorId, action, entityType, entityId, detail }) {
  await client.query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, detail)
     VALUES ($1, $2, $3, $4, $5)`,
    [actorId || null, action, entityType, entityId || null, JSON.stringify(detail || {})]
  );
}

module.exports = { writeAudit };
