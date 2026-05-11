# Do Not Contact

Marcar `do_not_contact` cuando:
- La persona pide no recibir más correos.
- La empresa pide removerse.
- Hay rebote permanente después de agotar patrones razonables.
- El correo pertenece a una persona que no corresponde y no derivó a otro contacto.

Efectos:
- Bloquear mensajes nuevos.
- Cancelar follow-ups pendientes.
- Guardar razón y fecha en `suppression_list`.
- Mantener historial para auditoría, sin borrar conversaciones.

Un primer rebote no necesariamente bloquea toda la empresa: marca ese contacto como `bounced`, crea un intento nuevo con otro patrón de email y no uses el thread del rebote.
