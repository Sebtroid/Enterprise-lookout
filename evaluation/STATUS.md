# Enterprise Lookout V2 — estado al 6 de octubre de 2026

## Actualización del 6 de octubre

El código está en `Sebtroid/Enterprise-lookout`, rama `codex/lookout-v2`. Los tres
proyectos V2 están conectados a GitHub y usan esa rama como producción. Las otras
ramas se omiten en V2. Los proyectos V1 conservan `main` y omiten la rama V2.

Google Cloud confirmó el guardado del origen público y los dos callbacks del
cliente existente. Las entradas localhost y los secretos permanecen conservados.
El control automático rechazó leer la pestaña local por su política de URLs.
No se intentó sustituir esa acción por otro navegador. La aceptación de ingreso,
Gmail y chat desde la interfaz pública permanece pendiente.

## Despliegue verificado el 2 de octubre

Los tres proyectos de V2 compilaron y alcanzaron READY en Vercel:

| Servicio | Dirección pública | Despliegue comprobado |
| --- | --- | --- |
| App | https://enterprise-lookout-v2.vercel.app | dpl_Hi79pRm4hrECmAtEvuMLBxQUQF38 |
| API | https://enterprise-lookout-v2-api.vercel.app | dpl_Ei7fAKMfDw3hggRmfgfRMs4gs861 |
| Dom | https://enterprise-lookout-v2-dom.vercel.app | dpl_7tTsTFmSvfTPpKJqACBWSXQ2TNkH |

La V1 en enterprise-lookout.vercel.app permanece separada. Los proyectos están
bajo sebastians-projects-fe7a7a60. Las fuentes se publicaron mediante CLI y no se
hizo push al repositorio trycompai. En esa fecha no había despliegue automático
desde GitHub; la conexión se completó el 6 de octubre.
Los archivos .env, .scratch y de evaluación quedan excluidos de la subida.

El primer build de frontend falló porque su comando ejecutaba un generador
nativo que exige GLIBC_2.39. El contrato ya generado está admitido expresamente
por apps/api/.gitignore. El comando corregido compila la app con ese contrato.
El nuevo build pasó TypeScript y generó 33 páginas con un worker. El build de
la API comparó el esquema privado con Prisma y no encontró diferencias.

READY acredita publicación y compilación. El acceso público autenticado y una
conversación completa de Dom desde la interfaz aún no tienen aceptación directa.
No se consultaron las URLs desplegadas mediante curl ni fetch para simular QA.

## Supabase y separación de datos

V2 usa el Supabase existente qyructbgynzxqlqxvojf, de la organización de
josemigueloaguado, y el esquema privado lookout_v2. El rol PostgreSQL tiene acceso
limitado al esquema privado. No se importaron empresas, contactos ni eventos
ficticios. La última revisión anterior al despliegue contó 69 tablas privadas,
un usuario de Lookout y ningún remitente autorizado.

El ingreso previo de sebawitting@gmail.com se comprobó localmente contra Better
Auth y Supabase. Ese ingreso local no acredita el nuevo acceso público.
Seba tiene el trabajo Recursos Financieros del Centro de Alumnos de Ingeniería
UANDES. La habilitación de Miguel requiere su correo de ingreso exacto.

Las empresas y los contactos son compartidos. Los trabajos y eventos separan
avance de auspicios, aportes, presupuesto, compromisos y seguimientos.
Los productos y servicios no incrementan automáticamente el dinero disponible.
Otra sección se consulta de manera deliberada. Su casilla Gmail permanece privada.

## Centro operativo y Dom

La entrada principal muestra el chat «¿Qué hacemos hoy?» y el contexto de persona,
trabajo y evento. El tablero está en /events. El inicio presenta seguimientos,
compromisos próximos, borradores y respuestas sincronizadas de las empresas del
contexto. Diferencia una casilla desconectada de una casilla sin mensajes.
No presenta mensajes como no leídos ni adjudica una conversación empresarial a
un solo evento sin evidencia.

El resumen operativo se calcula sin IA. Dom puede consultarlo, buscar marcas en
la base compartida y en la web mediante GLM, guardar candidatas, crear eventos
solicitados, guardar contactos con fuentes, preparar borradores y programar
seguimientos. Sus herramientas validan el contexto y permiten cambios solo en el
trabajo propio. Cambiar el contacto revoca aprobaciones de los borradores.
Las empresas y contactos archivados o bloqueados requieren revisión explícita.
Al terminar una respuesta se actualiza la caché del tablero y las listas.

Cada correo requiere revisión, aprobación vigente y un clic humano en Enviar.
Contenido y destinatario forman parte de la aprobación. La API rechaza contactos
bloqueados, inválidos, riesgosos, suprimidos o con rebotes. La entrega tiene una
reclamación atómica y un Message-ID estable. Una respuesta Gmail incierta no se
reintenta automáticamente. Dom y las claves API no aprueban ni envían correos.

## GLM y credenciales

Vault contiene las credenciales Google y la clave GLM completa. Una llamada real
a GLM 5.3 devolvió LISTO y HTTP 200. Una búsqueda web real mediante search-prime
pasó y devolvió ocho resultados con fuentes, incluidas páginas oficiales de CCU.
Estas verificaciones no importaron marcas ni contactaron a empresas.
Dom consulta la clave del Vault en cada solicitud. El lector privado admite solo
los tres secretos previstos. El rol de la app no lee Vault directamente.
Las credenciales no se envían al navegador ni se copian a las fuentes de Vercel.

Context.dev y Perplexity permanecen sin configurar. La búsqueda nueva de auspicios
usa GLM y no depende de esas capacidades opcionales. Custom GPT queda fuera del
alcance por decisión del usuario. Hermes no se instaló durante esta tanda.

## Google Cloud y Gmail

Google Cloud usa el proyecto vaulted-broker-510423-v7 y el cliente existente
«Enterprise Lookout · acceso web». Las credenciales ya están en Supabase Vault.
La configuración de localhost, Gmail API y usuarios de prueba fue comprobada en
la tanda anterior. El origen y los dos callbacks públicos se guardaron en ese
cliente el 6 de octubre. Google confirmó «Se guardó el cliente OAuth».

Origen público: https://enterprise-lookout-v2.vercel.app
Callback de identidad: https://enterprise-lookout-v2.vercel.app/api/auth/callback/google
Callback del remitente: https://enterprise-lookout-v2-api.vercel.app/google/mailbox/callback

La app y Better Auth usan el mismo origen público para las cookies de ingreso.
El callback del remitente sigue siendo independiente y vuelve a la API.
Los pasos exactos están en docs/setup.md y docs/lookout-vercel.md.
El ingreso es con sebawitting@gmail.com. El envío utiliza sawitting@miuandes.cl,
una vez aceptado su permiso independiente en Ajustes → Conexiones → Gmail.
No se envió ningún correo durante esta tanda.

Google conserva la audiencia en Testing. Los tokens de actualización con permisos
Gmail vencen a los siete días en ese modo. Vercel Hobby ejecuta los crons diarios;
la app conserva sincronización e investigación bajo demanda.

## Verificaciones del 2 de octubre y RAM

Pasaron 26 pruebas focalizadas con 67 aserciones: cuatro de operaciones, cinco de
candidatas, ocho de contactos y aprobaciones, seis de contexto y tres del proveedor
GLM. Los transportes de esas pruebas están simulados. Las dos llamadas reales
GLM anteriores se comprobaron por separado. TypeScript de API pasó antes del
primer despliegue. TypeScript de Dom pasó tras el último ajuste de contactos,
con 398 MB residentes observados. Biome revisó los archivos modificados.

El chequeo local de tipos del frontend se detuvo al alcanzar el heap limitado.
No se aumentó el límite. El chequeo y build completos posteriores pasaron en
Vercel. No se ejecutaron Docker, Turbo, Next dev, Eve dev ni Chrome. Los servidores
locales no estaban corriendo al comenzar esta tanda. La URL localhost no representa
el despliegue actual. Para trabajo local se mantiene scripts/start-lookout.sh,
con servicios compilados y monitor de memoria.

La revisión automática rechazó la apertura del navegador local. Un intento
independiente de abrir Google Cloud terminó sin control de navegador habilitado.
No se sustituyó ese control por Chrome, CDP o capturas obtenidas por comandos.
Las capturas anteriores en evaluation/screenshots no acreditan la interfaz nueva
ni una sesión pública. La revisión visual directa sigue pendiente.

## Pendientes de aceptación

1. Probar el ingreso público con sebawitting@gmail.com. Las direcciones del
   cliente Google ya están guardadas.
2. Autorizar sawitting@miuandes.cl, comprobar respuestas sincronizadas y probar
   una entrega aprobada por Sebastián. Revisar la publicación Google antes de
   depender de un token permanente.
3. Comprobar una conversación privada completa de Dom desde la app pública y
   revisar la interfaz. Los builds, pruebas y llamadas GLM no sustituyen esa QA.
4. Confirmar el correo de Miguel y verificar su sesión y separación de trabajos.
5. Para uso futuro con Hermes o CI, configurar esos servicios contra la API nueva.
   No son requisitos del chat operativo solicitado ni del despliegue actual.
