import { pastoralZone } from "@/lib/pastoral/config";

export const pastoralMailTemplates = [
  {
    id: "empresa-inicial",
    label: "Empresa - primer mail",
    subject: "Colaboración con Trabajo País UC 2026",
    body: `Estimado equipo de [Nombre de la empresa]:

Junto con saludar, me presento. Mi nombre es Sebastián Witting y soy jefe de Finanzas de Trabajo País, proyecto de la Pastoral de la Pontificia Universidad Católica de Chile.

Trabajo País es un voluntariado que desde 2006 convoca a jóvenes universitarios para trabajar junto a comunidades vulnerables de Chile, construyendo espacios de encuentro comunitario a partir de necesidades levantadas en terreno.

A lo largo de este tiempo, más de 20.000 voluntarios han participado en el proyecto, trabajando junto a más de 450 comunidades a lo largo de Chile, lo que ha convertido a Trabajo País en el voluntariado católico más grande de Latinoamérica.

Este invierno, en nuestro vigésimo aniversario, nuestra zona trabajará junto a la comunidad de ${pastoralZone.locality}, en la comuna de ${pastoralZone.commune}, Provincia de ${pastoralZone.province}, Región de ${pastoralZone.region}. Cada aporte permite financiar materiales, herramientas, transporte y recursos necesarios para ejecutar el trabajo directamente en terreno.

Les escribo porque creemos que [Nombre de la empresa] podría ser un aliado valioso para esta comunidad, especialmente si existe algún vínculo territorial o interés en apoyar iniciativas locales en la zona de ${pastoralZone.commune} e Itata. La colaboración puede ser mediante una donación, apoyo en materiales o algún aporte institucional.

Nos gustaría presentarles brevemente el proyecto y evaluar si existe una forma de colaboración que tenga sentido para ustedes. Contamos con información formal sobre beneficios tributarios, detallada en la carta adjunta.

¿Podríamos coordinar una llamada breve esta semana?

Saludos,
Sebastián Witting
Jefe de Finanzas - Trabajo País UC 2026`,
  },
  {
    id: "empresa-seguimiento-2",
    label: "Empresa - seguimiento 2",
    subject: "Invitación a proyecto Trabajo País UC 2026",
    body: `Estimado equipo de [Nombre de la empresa]:

Junto con saludar, me permito escribir nuevamente para reiterar la invitación que les envié hace algunos días respecto a la posibilidad de que [Nombre de la empresa] pueda colaborar con Trabajo País UC 2026.

Este año el proyecto celebra su vigésimo aniversario y esperamos movilizar a más de 850 voluntarios que trabajarán junto a distintas comunidades del país en la construcción de capillas y espacios de encuentro comunitario.

Si existiera la posibilidad de explorar alguna forma de apoyo o colaboración institucional, sería una gran ayuda para poder llevar adelante este proyecto.

Quedo totalmente disponible para coordinar una breve reunión o entregar más información.

Saludos,
Sebastián Witting
Jefe de Finanzas - Trabajo País UC 2026`,
  },
  {
    id: "empresa-seguimiento-3",
    label: "Empresa - seguimiento 3",
    subject: "Invitación a proyecto Trabajo País UC 2026",
    body: `Estimado equipo de [Nombre de la empresa]:

Junto con saludar, quisiera hacer un breve seguimiento respecto a la invitación enviada para que [Nombre de la empresa] pueda colaborar con Trabajo País UC 2026.

Este año movilizaremos a más de 850 voluntarios en 25 zonas del país, trabajando junto a comunidades en la construcción de capillas y espacios comunitarios. Actualmente seguimos reuniendo el financiamiento necesario para poder llevar adelante este desafío.

Si existiera interés en explorar alguna forma de colaboración, quedo totalmente disponible para enviar más información o coordinar una breve reunión.

Muchas gracias por su tiempo.

Sebastián Witting
Jefe de Finanzas - Trabajo País UC 2026`,
  },
  {
    id: "persona-inicial",
    label: "Persona natural - primer mail",
    subject: "Invitación a colaborar con Trabajo País UC 2026",
    body: `Estimado/a [Nombre]:

Junto con saludar, me presento. Mi nombre es Sebastián Witting y soy jefe de Finanzas de Trabajo País, proyecto de la Pastoral de la Pontificia Universidad Católica de Chile.

Trabajo País es un voluntariado que desde 2006 convoca a jóvenes universitarios para construir espacios de encuentro comunitario en distintas zonas vulnerables del país.

En este vigésimo aniversario, nuestra zona trabajará junto a la comunidad de ${pastoralZone.locality}, en la comuna de ${pastoralZone.commune}, Provincia de ${pastoralZone.province}, Región de ${pastoralZone.region}. Cada aporte ayuda a financiar materiales, herramientas, transporte y recursos que se usan directamente en el trabajo con la comunidad.

Quisiera invitarlo personalmente a ser parte de este proyecto mediante una donación voluntaria que nos permita seguir llevando adelante esta misión.

En caso de contar con su apoyo, podemos ofrecer beneficios tributarios, detallados en la carta adjunta.

Quedo totalmente disponible para contarle más detalles del proyecto o resolver cualquier duda.

Se despide en Cristo,
Sebastián Witting
Jefe de Finanzas - Trabajo País UC 2026`,
  },
  {
    id: "whatsapp-persona",
    label: "WhatsApp - persona",
    subject: "Mensaje WhatsApp",
    body: `Hola [Nombre], ¿cómo estás?

Soy Sebastián, jefe de Finanzas de Trabajo País UC.

Este año celebramos 20 años del proyecto y esperamos movilizar cerca de 850 voluntarios en julio, levantando 25 espacios comunitarios en distintas zonas de Chile.

Para hacerlo posible estamos buscando apoyo, ya sea como empresa o como persona natural, con aporte financiero o materiales. También contamos con información sobre beneficios tributarios para quienes colaboran.

Si te interesa conocer más o ver de qué forma podrías apoyar, feliz de enviarte más información.

Muchas gracias por tu tiempo.`,
  },
];
