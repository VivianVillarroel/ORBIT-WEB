# Orbit · Celda robotizada M2

Versión 0.3: manipulación directa en Unity **6000.3.3f1**, exportación WebGL para Orbit. El taller tiene una guía lateral persistente y marcas que señalan el objeto y el destino de cada acción. Los modelos incorporan carcasas curvas y piezas mecanizadas. El alcance exacto y las referencias están en `DISENO-M2.md`.

## Abrir y exportar

1. En Unity Hub, añadir esta carpeta como proyecto existente.
2. Abrir `Assets/Scenes/M2.unity` (se genera durante la primera exportación).
3. Usa el menú **Orbit → Exportar M2 para la web** para recrear la escena, comprobar lógica y exportar. También se puede ejecutar desde PowerShell:

```powershell
& 'C:/Program Files/Unity/Hub/Editor/6000.3.3f1/Editor/Unity.exe' -batchmode -nographics -quit -projectPath "$PWD/unity/OrbitM2" -executeMethod OrbitBuild.Web -buildTarget WebGL -logFile "$PWD/unity-build.log"
```

Ejecutar desde la raíz del repositorio con el proyecto cerrado en el editor. La exportación se guarda en `orbit-web/simuladores/m2/`. Se sirve con el mismo servidor PHP/Apache de Orbit; no se abre mediante doble clic al HTML.

En el panel de Orbit, crear o editar un laboratorio y colocar `simuladores/m2/index.html` en **Modelo 3D o simulador Unity**. Asignar las carreras y el estado desde el panel. No se modifican registros de la base de datos automáticamente.

## Primera práctica

1. Agarrar una pieza de aluminio de la mesa con el mouse izquierdo y soltarla sobre el aro amarillo de la cinta.
2. Agarrar la manija azul y arrastrar a la derecha para cerrar la puerta (a la izquierda para abrir).
3. Arrastrar hacia arriba el seccionador rojo del gabinete para energizar. Arrastrar abajo para aislar.
4. Agarrar la argolla amarilla sobre la pinza y llevarlo al aro de toma de la cinta. Soltar guarda las coordenadas elegidas. Repetir sobre el aro azul de la bandeja de salida.
5. Arrastrar hacia arriba la palanca verde de la consola para ejecutar el ciclo manual.
6. Cuando el robot haya depositado la pieza y vuelto a reposo, bajar el interruptor rojo hasta 0. Aparecerá «Práctica completada», con descarga del informe o repetición voluntaria. Esta práctica guiada termina con una pieza; no vuelve al paso 1.

La puerta, el seccionador y la palanca responden continuamente al arrastre. El sensor fotoeléctrico se puede desalinear arrastrándolo durante un ciclo. Para recuperarlo, devolverlo a la posición original con la celda aislada y pulsar R para comprobar seguridad y rearmar. El paro de emergencia está sobre la consola; se presiona directamente y se libera arrastrándolo hacia arriba. Cerrar la puerta o rearmar nunca arranca el robot.

Mouse derecho: mirar alrededor. Rueda: acercarse. WASD: desplazarse. F sobre un objeto: acercar la cámara. V: vista general. Tab: bitácora. J: descargar informe. Escape: paro de emergencia. La guía de práctica permanece visible en la exportación web. Se recomienda pantalla completa y ratón.

La bitácora registra decisiones, rechazos, piezas y tiempos. El informe JSON se descarga desde el navegador; todavía no se guarda automáticamente en la base de datos de Orbit.

## Alcance y referencias

Fuente: ficha **M2. Puesta en marcha de una celda automatizada pick-and-place con robot industrial, PLC y HMI**, PDF `Propuesta de laboratorios virtuales 12 fichas técnicas ... _DMEC.pdf`, carpeta de Drive proporcionada por el usuario (20 octubre 2026).

Prototipo funcional: modelos propios de geometría biselada, materiales con respuesta especular y sombras, cinemática inversa de dos segmentos y enseñanza de puntos con el mouse dentro de las zonas de práctica. PLC emulado local. No incluye programación libre de PLC, Modbus/OPC UA, robot real ni validación industrial. La toma usa un agarre asistido; no calcula colisiones ni física de agarre. Antes de evaluación académica requiere revisión docente. Diseñado para computadora con ratón; VR, controles táctiles y alternativas completas de accesibilidad están pendientes.

Tipografía Barlow, distribuida bajo SIL OFL; licencia incluida en `Assets/Resources/OrbitSans-LICENSE.txt`, fuente: repositorio oficial `google/fonts`, carpeta `ofl/barlow`.

La exportación usa archivos sin compresión para funcionar con Apache/PHP sin configurar encabezados de compresión. El paquete web puede ser grande; optimizar tamaño y carga antes de publicación.

## Revisión visual de Orbit

La guía web usa el logotipo y la hoja de estilos de Orbit, instrucciones numeradas y el resultado esperado de cada acción. La celda incorpora paños de vallado completos, puerta con manija, bisagras, cerradura y poste receptor, banda continua, motor con aletas, conductos y anclajes. El cierre exige llegar al marco; la apertura interrumpe la celda desde los primeros grados.

## Corrección de depósito y controles

El depósito se limita a una zona interior que deja margen para toda la pieza. La trayectoria separa aproximación, descenso, elevación, traslado, entrega y retirada vertical antes de volver a reposo. Solo se deposita una pieza en esta práctica. La palanca y el interruptor conservan un área de agarre de 29 píxeles, aceptan un arrastre corto (6 unidades normalizadas) y mantienen la selección aunque el cursor salga del mando. El paro de emergencia conserva prioridad de selección.
