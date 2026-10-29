# Comprobación de la primera entrega

## Revisión 0.3 · Modelos e instrucciones

El usuario confirmó continuar con M2 del PDF, diferenciándolo de las referencias de motores de E1. Se incorporó una guía web conectada con Unity, con instrucciones grandes, estado de los seis pasos, indicación del gesto y marcas sobre el componente y su destino. Se verificó el diseño a 1440 × 900 y en el panel estrecho de 447 × 720.

En el navegador se recorrieron carga, cierre de puerta, energización, enseñanza de toma, enseñanza de depósito y marcha utilizando las nuevas marcas. El ciclo terminó con una pieza depositada y el contador actualizado. Los modelos utilizan carcasas curvas, herrajes y piezas con taladros pasantes. Se corrigió la referencia de resaltado a las geometrías antiguas de las piezas.

El visor de Orbit se ajustó para dar ancho completo y altura suficiente al simulador Unity. JavaScript validado por sintaxis; no se alteraron registros ni asignaciones de la base de datos.

## Revisión 0.2 · Manipulación directa

Se probó la exportación Unity en el navegador a 1440 × 900: arrastrar una pieza desde la mesa a la cinta, cerrar la puerta por su manija, energizar arrastrando el seccionador, llevar la pinza al punto de toma, llevarla al depósito y arrancar mediante la palanca del equipo. El flujo pasó de preparación a movimiento sin utilizar un menú de acciones. Se comprobaron los mensajes contextuales y el cambio de objetivo después de cada operación.

El ciclo terminó con una pieza depositada. El informe descargado registró toma `(-2.13, 1.95, -0.23)` y depósito `(2.09, 1.95, -0.11)`, seleccionados mediante arrastre. Intentar mover otra pieza con el equipo energizado quedó bloqueado. Abrir la puerta arrastrando su manija dejó la celda aislada y con rearme pendiente. La consola del navegador no registró errores durante esta prueba.

La selección utiliza una capa dedicada para que los alambres del vallado no intercepten el puntero destinado a los componentes manipulables. La puerta interrumpe el funcionamiento en cuanto empieza a abrirse. La prueba de estados incluye conservar la fase de movimiento al entrar en parada de seguridad.

La revisión mantiene las limitaciones de simulación: agarre asistido, cinemática simplificada, sin colisiones físicas ni PLC externo. El equipo admite una pieza cargada a la vez y se detiene cuando falta material.

## Registro de la versión inicial

20 de octubre de 2026 · Unity 6000.3.3f1 · exportación WebGL · navegador local.

Se verificó la máquina de estados con aserciones ejecutadas antes de compilar: inicio sin preparación bloqueado; prueba manual; prueba semiautomática; falla que desenergiza; rechazo de rearme con causa activa; rearme sin arranque; parada por puerta abierta y bloqueo del reinicio al cerrar sin comprobar seguridad.

Se probó en la interfaz del navegador: preparar seguridad y E/S, guardar los dos puntos, completar un ciclo manual y uno semiautomático, pasar a automático, producir una tercera pieza, provocar falla de sensor, corregir, verificar y rearmar. El informe JSON descargado registró tres piezas, cero decisiones rechazadas y los eventos correspondientes.

El panel web de Orbit pasó las comprobaciones de sintaxis JavaScript y PHP. La asignación del laboratorio a carreras o clases y el guardado de prácticas en MySQL no se probaron de extremo a extremo ni se cambiaron registros de la base de datos.

Pendientes del producto completo: modelos detallados basados en equipos reales, programación editable del PLC, enseñanza libre de coordenadas, detección de colisiones, señales y fallas con mayor fidelidad, evaluación docente, almacenamiento automático de evidencias en Orbit, accesibilidad de los controles internos del lienzo y soporte móvil/VR. Esta entrega es un prototipo funcional para computadora.

## Revisión Orbit y cierre de puerta · 20 octubre 2026

Compilación WebGL y pruebas de estados correctas (ORBIT_STATE_TESTS_OK, ORBIT_BUILD_OK). En navegador a 1440 × 900 se completó cargar, cerrar por arrastre hasta el marco, encender, enseñar ambos puntos y ejecutar un ciclo: una pieza depositada y ningún error nuevo de consola. El cierre quedó alineado con el poste receptor. Se revisó también el diseño a 447 × 720, con la guía debajo de la escena. Se retiró el rótulo R6-03; la cabecera usa el logotipo real de Orbit. Las instrucciones muestran objeto, gesto y resultado esperado.

## Final de práctica y depósito · 20 octubre 2026

Compilación WebGL y pruebas de estados correctas. Se completó en el navegador: carga, cierre, encendido, enseñanza, ejecución, retirada de la pinza, apagado y pantalla Práctica completada. Una pieza quedó dentro de la bandeja; el robot volvió a reposo. Ya no vuelve a cargar automáticamente.

El interruptor respondió tomando 15 píxeles fuera del centro y arrastrando 12 píxeles. La palanca respondió tomando 12 píxeles fuera del centro y arrastrando 12 píxeles. El apagado final también respondió con 12 píxeles. El botón del informe activó la descarga y mostró confirmación. Ningún error nuevo en consola.

Se comprueba el solapamiento de la pieza transportada con los obstáculos. Los puntos se limitan al interior de las superficies y al alcance del brazo. Se eleva antes de trasladar y retira verticalmente tras soltar. Esta protección se aplica a la pieza; no constituye dinámica completa ni detección de autocolisiones del robot.
