# RPS Battle · Guía para publicar en Google Play

Guía paso a paso para publicar la app de Android en Google Play Console.
Idioma principal de la ficha: **Español (Latinoamérica) – es-419**.
Los límites de caracteres de Google van entre paréntesis.

| Dato | Valor |
|---|---|
| Nombre de la app | `RPS Battle` |
| ID de aplicación (package) | `com.jorgeme0996.rpsbattle` |
| Proyecto Android | `android/` (Capacitor 7) |
| targetSdk / compileSdk | 36 (Android 16) · minSdk 23 (Android 6.0) |
| Política de privacidad | `https://rps-battle-production-7f46.up.railway.app/privacy.html` |
| Soporte | `https://rps-battle-production-7f46.up.railway.app/support.html` |
| Correo de contacto | `jorgeme0996@gmail.com` |
| Gráficos listos | `dist/play-store-assets/` (se regeneran, `dist/` no está en git) |

> **Requisito vigente de nivel de API:** desde el 31 de agosto de 2026, las apps nuevas y las
> actualizaciones deben apuntar a **Android 16 (API 36)** o superior (se podía pedir prórroga hasta
> el 1 de noviembre de 2026). Capacitor 7 crea el proyecto con API 35, por eso
> `android/variables.gradle` ya está en `compileSdkVersion = 36` y `targetSdkVersion = 36`.
> Fuente: https://developer.android.com/google/play/requirements/target-sdk

---

## 0. Preparar la Mac (una sola vez)

Lo que ya tienes (revisado el 28/09/2026):

- JDK 21 (Temurin 21.0.11) y JDK 26 instalados. **El `java` por defecto es el 26**, y Gradle 8.11
  (el que usa Capacitor 7) **no funciona con Java 26**. Usa siempre el JDK 21 para compilar Android.
- Android SDK en `~/Library/Android/sdk` con `platform-tools` (adb) y `emulator`, **sin `cmdline-tools`**
  (no hay `sdkmanager`). La primera compilación descargó sola la plataforma Android 36 y build-tools 34
  (las licencias ya estaban aceptadas).
- Capacitor 7 usa Android Gradle Plugin 8.7.2, probado oficialmente hasta API 35. Compila bien con
  API 36; el aviso se silenció con `android.suppressUnsupportedCompileSdk=36` en `android/gradle.properties`.
- Un emulador: `Pixel_3a_API_33_arm64-v8a` (Android 13).
- `ANDROID_HOME` no está definido (Gradle usa `android/local.properties`, que Capacitor generó con la ruta del SDK).
- Android Studio **no** está instalado.

Agrega esto a `~/.zshrc` y abre una terminal nueva:

```bash
export JAVA_HOME="$HOME/Library/Java/JavaVirtualMachines/temurin-21.0.11/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
```

Comprueba: `java -version` debe decir 21.

**Recomendado: instala Android Studio** (https://developer.android.com/studio). Trae su propio JDK 21,
el SDK Manager (para instalar "Android 16 (API 36)", "Build-Tools" y "Command-line Tools") y el
Device Manager para crear un emulador con Android 15/16 (el tuyo es Android 13). Con Android Studio
abierto: `npx cap open android`.

Sin Android Studio, instala solo las command-line tools:
1. Descarga "Command line tools only" para Mac desde https://developer.android.com/studio#command-line-tools-only
2. Descomprime en `~/Library/Android/sdk/cmdline-tools/latest/` (debe quedar `.../latest/bin/sdkmanager`).
3. Para crear un emulador con Android 16 (recomendado para probar edge-to-edge):
   ```bash
   SDK=~/Library/Android/sdk/cmdline-tools/latest/bin
   $SDK/sdkmanager "system-images;android-36;google_apis_playstore;arm64-v8a"
   $SDK/avdmanager create avd -n Pixel_API_36 -k "system-images;android-36;google_apis_playstore;arm64-v8a" -d pixel_7
   emulator -avd Pixel_API_36
   ```

---

## 1. Compilar y probar la app

```bash
npm install                 # instala @capacitor/android@7 (ya está en devDependencies)
npm run build:android       # arma dist/native-web (sin CDNs) y hace `npx cap sync android`
cd android
./gradlew assembleDebug     # APK de prueba: app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Para arrancar el emulador: `emulator -avd Pixel_3a_API_33_arm64-v8a` (o desde Android Studio).

Qué revisar en el teléfono/emulador:
- Abre en vertical, con fondo oscuro, sin barra blanca al arrancar.
- El menú muestra "JUGANDO COMO" con un nombre automático tipo `TijeraVeloz42`
  (en Android no hay Game Center; el nombre generado se guarda y se reutiliza).
- Nada del juego queda debajo de la barra de estado ni de la barra de navegación
  (la WebView se coloca entre las barras; detrás de ellas se ve el color `#0c0a1f`).
- "¡JUGAR!" → si no hay nadie, a los ~12 s entra el bot y se juega una partida completa.
- "Compartir" abre el menú nativo de Android y la vibración funciona.

**`npm run build:ios` sigue funcionando igual**: iOS y Android comparten el mismo paquete web
(`scripts/build-native.js` → `dist/native-web`). La primera vez que corras `npm run build:ios` después
de este cambio, `ios/App/App/capacitor.config.json` se actualizará solo con el nuevo `webDir`.

---

## 2. Cuenta de Google Play Console

1. Entra a https://play.google.com/console/signup con la cuenta de Google que quieras usar.
2. Tipo de cuenta: **Personal** (tú como persona) u **Organización** (requiere número D-U-N-S).
3. Paga la **cuota única de 25 USD**.
4. **Verificación de identidad**: nombre legal y dirección que coincidan con una identificación
   oficial; verifica también correo y teléfono. En cuentas personales Google además pide confirmar
   que tienes acceso a un **teléfono Android real** (con la app Play Console).
5. Datos públicos de desarrollador: nombre `Jorge de Jesús Martinez Espino` (o el que quieras mostrar)
   y correo `jorgeme0996@gmail.com`.

### IMPORTANTE: prueba cerrada obligatoria (cuentas personales nuevas)

Las cuentas personales creadas después del 13 de noviembre de 2023 **no pueden publicar en
Producción** hasta que:

- Hagan una **prueba cerrada** con **al menos 12 testers** inscritos, y
- Esos testers hayan estado inscritos **de forma continua durante los últimos 14 días**
  (quien se sale antes de 14 días no cuenta).
- Después se pide el **acceso a producción** desde el Panel, respondiendo unas preguntas sobre la prueba.

(Verificado el 28/09/2026 en https://support.google.com/googleplay/android-developer/answer/14151465 .
Consigue 13–15 testers para tener margen; pídeles abrir el juego varias veces durante esas 2 semanas.)

---

## 3. Crear la app en Play Console

**Todas las apps → Crear app**
- Nombre: `RPS Battle`
- Idioma predeterminado: `Español (Latinoamérica) – es-419`
- App o juego: **Juego**
- Gratis o de pago: **Gratis** (no se puede cambiar a pago después)
- Acepta las declaraciones (Políticas del programa para desarrolladores y leyes de exportación de EE. UU.).

---

## 4. Clave de subida (upload key) y firma

Google firma la app que reciben los usuarios (**Firma de apps de Play / Play App Signing**, obligatoria
para AAB y la opción recomendada). Tú solo firmas lo que subes con tu **clave de subida**. Si la pierdes,
Google puede restablecerla; la clave de firma final nunca sale de Google.

### 4.1 Crear la clave (una sola vez, tú mismo)

Guárdala **fuera del repositorio** (por ejemplo `~/keys/`) y respáldala (gestor de contraseñas + copia
cifrada). Elige tú las contraseñas; `keytool` te las pedirá.

```bash
mkdir -p ~/keys
"$JAVA_HOME/bin/keytool" -genkeypair -v \
  -keystore ~/keys/rps-battle-upload.jks \
  -storetype PKCS12 \
  -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Jorge de Jesus Martinez Espino, O=jorgeme0996, C=MX"
```

(Con PKCS12 la contraseña de la clave es la misma que la del almacén.)

### 4.2 Decirle a Gradle dónde está la clave

`android/app/build.gradle` ya lee la firma de release de **`android/keystore.properties`**
(ignorado por git: está en `android/.gitignore` junto con `*.jks` y `*.keystore`) o, si no existe,
de variables de entorno. Crea el archivo:

```properties
# android/keystore.properties  — NO subir a git
storeFile=/Users/jorgedejesusmartinezespino/keys/rps-battle-upload.jks
storePassword=TU_CONTRASEÑA
keyAlias=upload
keyPassword=TU_CONTRASEÑA
```

Alternativa sin archivo (útil en CI): `RPS_UPLOAD_STORE_FILE`, `RPS_UPLOAD_STORE_PASSWORD`,
`RPS_UPLOAD_KEY_ALIAS`, `RPS_UPLOAD_KEY_PASSWORD`.

Comprueba antes de hacer commit: `git status` no debe mostrar `keystore.properties` ni el `.jks`.

### 4.3 Generar el AAB firmado

```bash
npm run build:android
cd android
./gradlew bundleRelease
# → android/app/build/outputs/bundle/release/app-release.aab
```

Si no configuraste la clave, Gradle genera un AAB **sin firmar** y Play Console lo rechaza.

### 4.4 Activar Play App Signing

La primera vez que subas un AAB a cualquier pista, Play Console te ofrece **"Usar clave de firma
generada por Google"**: acéptalo (es lo recomendado). La clave con la que firmaste ese AAB queda
registrada como tu clave de subida.

---

## 5. Ficha de Play Store (Crecer → Presencia en Play Store → Ficha principal)

**Nombre de la app** (30):
```
RPS Battle
```

**Descripción breve** (80):
```
Piedra, papel o tijera en duelos 1v1 en tiempo real. ¡Craftea, lanza y gana!
```

**Descripción completa** (4000) — adaptada de la de App Store (sin Game Center):
```
RPS Battle es piedra, papel o tijera como nunca lo habías jugado: en tiempo real, cara a cara y con estrategia.

En lugar de solo elegir una mano, CRAFTEAS tus piedras, papeles y tijeras y los LANZAS por tres carriles hacia el castillo de tu rival. Cuando dos objetos chocan, gana el de siempre: la piedra rompe la tijera, la tijera corta el papel y el papel envuelve la piedra. Cada objeto que llega a la base enemiga le quita 10 de vida.

Lee los movimientos de tu rival, defiende el carril correcto y rompe su defensa antes de que se acaben los 3 minutos.

CARACTERÍSTICAS
• Duelos 1 vs 1 en línea en tiempo real
• Juega con tus amigos con un enlace de invitación
• Revancha instantánea contra el mismo rival
• Siempre hay partida: si no hay nadie conectado, juegas contra un bot
• Sin registros ni formularios: te asignamos un nombre de jugador automático
• Partidas rápidas de 3 minutos, perfectas para cualquier momento
• Sin anuncios

¿Te atreves a retar a tus amigos?
```

**Categorización y contacto** (Configuración de la tienda):
- Tipo: **Juego** · Categoría: **Estrategia** (alternativa: Casual)
- Etiquetas: elige hasta 5, p. ej. *Multijugador*, *Competitivo*, *Casual*, *Estrategia*, *Un jugador contra la IA* (si aparece)
- Correo: `jorgeme0996@gmail.com` · Sitio web: `https://rps-battle-production-7f46.up.railway.app/support.html`

### Gráficos (usa los archivos de `dist/play-store-assets/`)

| Recurso | Requisito de Google | Archivo |
|---|---|---|
| Ícono de la app | PNG 32 bits (con alfa), 512×512, ≤ 1 MB | `icon_512x512.png` |
| Gráfico de funciones | JPG o PNG 24 bits (sin alfa), 1024×500 | `feature-graphic_1024x500.png` |
| Capturas de teléfono | 2 a 8; JPG o PNG 24 bits; lado corto ≥ 320 px, lado largo ≤ 3840 px, y el lado largo no puede ser más de 2× el corto | `phone-screenshots/01_menu.png` … `06_victoria.png` (1080×1920, en ese orden) |
| Tablet 7"/10" | Opcionales (solo si quieres aparecer como app para tablet) | — |
| Video de YouTube | Opcional | Se puede subir `preview_portrait_1080x1920.mp4` a YouTube (sin listar) y pegar el enlace |

Las capturas de iPhone (1320×2868) **no sirven tal cual** en Play (el lado largo es más de 2× el corto);
las de `phone-screenshots/` son las mismas imágenes reencuadradas a 9:16.

---

## 6. Contenido de la app (Política → Contenido de la app)

Completa **todas** las secciones; Play no deja enviar a revisión hasta terminar.

### 6.1 Política de privacidad
`https://rps-battle-production-7f46.up.railway.app/privacy.html`

> Esta versión del repo agrega a la política y a la página de soporte que en Android el nombre es
> generado al azar. **Despliega a Railway** antes de enviar a revisión para que la URL publicada lo diga.

### 6.2 Acceso a la app
**"Todas las funciones están disponibles sin acceso especial"** (no hay inicio de sesión).
Si quieres dejar una nota para el revisor (sección de instrucciones, en inglés):
```
No account or login is required. Tap "¡JUGAR!". If no other player is online, you are matched against a bot after about 12 seconds, so a full match can be played by a single reviewer. To play: tap the crafting steps of rock, paper or scissors; when an item is ready, tap it and then tap a lane to launch it toward the enemy castle.
```

### 6.3 Anuncios
**No, mi app no contiene anuncios.**

### 6.4 Clasificación de contenido (cuestionario IARC)
- Correo: `jorgeme0996@gmail.com` · Categoría: **Juego**
- Violencia: **No** (objetos que chocan y un castillo que pierde vida; no hay personajes, sangre ni armas realistas)
- Miedo / terror: **No** · Sexualidad / desnudos: **No** · Lenguaje soez: **No**
- Sustancias (drogas, alcohol, tabaco): **No**
- Humor crudo: **No**
- Apuestas / juegos de azar simulados: **No** · Dinero real / premios: **No**
- ¿Los usuarios pueden interactuar o intercambiar contenido? **Sí** — juegan en línea contra otros
  jugadores en tiempo real y ven el nombre del rival (no hay chat, ni se comparten fotos o texto libre).
  Esto solo agrega el aviso "Los usuarios interactúan"; no sube la edad.
- ¿Comparte la ubicación del usuario con otros? **No**
- ¿Permite compras digitales? **No**
- ¿Es un navegador web o buscador? **No** · ¿Acceso sin restricciones a internet? **No**
- Resultado esperado: **PEGI 3 / ESRB Everyone / Clasificación IARC 3+** (o equivalente).

### 6.5 Público objetivo y contenido
- Grupos de edad: **13–15, 16–17 y 18 o más**.
  Recomendado **no** marcar menores de 13: si los marcas, aplica la política de Familias
  (requisitos extra para la analítica y los SDK). Si en el futuro quieres incluir niños, revisa esa política primero.
- "¿Tu app podría atraer a niños sin querer?": responde con honestidad; el estilo es caricaturesco,
  así que Google puede preguntar. Si respondes que no está dirigida a niños, el texto de la ficha no
  debe apuntar a niños (la descripción actual no lo hace).

### 6.6 Seguridad de los datos (Data safety)
Coherente con la política de privacidad:

- **¿Tu app recopila o comparte alguno de los tipos de datos del usuario requeridos?** Sí
- **¿Todos los datos se encriptan en tránsito?** Sí (HTTPS / WSS al servidor de Railway)
- **Métodos de creación de cuentas:** *Mi app no permite que los usuarios creen cuentas*
- **¿Ofreces una forma de solicitar la eliminación de datos?** Sí: por correo a `jorgeme0996@gmail.com`
  (así lo dice la política); también se borra el ID al desinstalar.

Tipos de datos a declarar:

| Categoría → tipo | ¿Recopilado? | ¿Compartido? | ¿Efímero? | ¿Obligatorio? | Propósito |
|---|---|---|---|---|---|
| **ID del dispositivo u otros IDs** → *ID del dispositivo u otros identificadores* (ID aleatorio creado por el juego, no es el ID de publicidad) | Sí | No | No | Sí (no se puede desactivar) | **Estadísticas** |
| **Actividad en la app** → *Interacciones con la app* (abrir el juego, entrar a la cola, resultado y duración de las partidas, revanchas, compartir) | Sí | No | No | Sí | **Estadísticas** |

- **No declarar** como "compartido": el alojamiento en Railway (y PostHog, si activas `POSTHOG_KEY`)
  son proveedores de servicio que procesan datos en tu nombre; Google no lo considera "compartir".
- **Nombre del jugador:** en Android es un nombre generado al azar (no lo escribe el usuario), solo se
  envía al rival en tiempo real y no se guarda; no es información personal, no se declara.
- **Dirección IP:** solo se usa para mantener la conexión; no se guarda como dato del usuario, no se declara.
- No hay ubicación, contactos, fotos, correo, teléfono, pagos, ni ID de publicidad.

### 6.7 Otras declaraciones
- **ID de publicidad:** *No, mi app no usa el ID de publicidad* (la app no incluye SDK de anuncios; el
  manifiesto no pide `AD_ID`).
- **Apps gubernamentales:** No · **Funciones financieras:** Ninguna · **Salud:** No aplica
- **Noticias:** No es una app de noticias.

---

## 7. Pistas de prueba y lanzamiento

Cada AAB que subas debe tener un **`versionCode` mayor** que el anterior
(`android/app/build.gradle` → `versionCode 1`, `versionName "1.0"`). Súbelo antes de cada `bundleRelease` nuevo.

1. **Prueba interna** (Pruebas → Prueba interna): hasta 100 testers, disponible en minutos, sin revisión
   larga. Crea una lista de correos, sube `app-release.aab`, acepta Play App Signing (paso 4.4), publica
   y comparte el enlace de inscripción. Sirve para verificar que la versión de Play instala y funciona.
2. **Prueba cerrada** (Pruebas → Prueba cerrada → pista "Alpha"): **aquí cuentan los 12 testers × 14 días**.
   - Agrega a los testers por lista de correos (cuentas de Google) o por un Grupo de Google.
   - Países: al menos México (y los que quieras).
   - Sube el mismo AAB (o uno nuevo con `versionCode` mayor) y envía a revisión.
   - Comparte el enlace de inscripción; cada tester debe **aceptar la invitación e instalar desde Play**.
   - Durante los 14 días puedes subir actualizaciones sin reiniciar el conteo.
3. **Solicitar acceso a producción** (Panel → "Solicitar acceso a producción") cuando el Panel indique
   que se cumplieron 12 testers durante 14 días. Google revisa la solicitud (suele tardar unos días).
4. **Producción** (Producción → Crear versión): sube/promueve el AAB, elige países y envía a revisión.
   Puedes hacer lanzamiento escalonado (p. ej. 20 %) y luego subirlo al 100 %.

---

## 8. Publicar una nueva versión después de cambiar el juego

Los cambios en `server.js`/`bot.js` solo requieren desplegar el servidor. Si cambias `public/game.js`,
`public/index.html` o algo de la app:

```bash
# 1. Sube versionCode (y versionName si quieres) en android/app/build.gradle
npm run build:android          # reconstruye dist/native-web y sincroniza android/
cd android && ./gradlew bundleRelease
# 2. Play Console → la pista que toque → Crear versión → subir app-release.aab
```

Recuerda que el juego de la app habla con el servidor de Railway: si cambias el protocolo de
socket.io, mantén compatibilidad con las versiones ya instaladas (en iOS y Android).
Para apuntar a otro servidor: `RPS_SERVER=https://otro-servidor npm run build:android`.

Para regenerar los gráficos de la ficha: se crearon con Python/PIL a partir de
`dist/app-store-screenshots/` (reencuadre a 1080×1920), la portada 1920×1080 del juego
(gráfico de funciones) y `public/icon.svg` (ícono 512). Los íconos adaptativos y el splash de Android
viven en `android/app/src/main/res/` (mipmap-*/ic_launcher_*, drawable-*/splash*.png).

---

## 9. Opcional, más adelante: Google Play Games Services

El equivalente Android de Game Center es **Play Games Services v2** (inicio de sesión automático y
nombre de jugador de Play Games). **No está incluido** y no hace falta para publicar: en Android se usa
el nombre generado. Si algún día lo quieres:
crear el proyecto de Play Games en Play Console (Crecer → Play Games Services), añadir
`com.google.android.gms:play-services-games-v2` y un pequeño plugin nativo `GameCenter` para Android
(la misma interfaz `signIn()` que ya usa `setupNativeName()` en `public/game.js`, devolviendo
`{ alias }`). Eso implicaría también actualizar la política de privacidad y la sección de seguridad de los datos.

---

## Pendientes

- [ ] Instalar/usar JDK 21 por defecto (o Android Studio) — ver sección 0
- [ ] Crear cuenta de Play Console (25 USD) y completar verificación de identidad
- [ ] Crear la clave de subida y `android/keystore.properties` (sección 4)
- [ ] Desplegar a Railway la política/soporte actualizados (mencionan Android)
- [ ] Prueba interna → prueba cerrada con ≥ 12 testers durante 14 días → acceso a producción
- [ ] Probar en un dispositivo/emulador con Android 15 o 16 (edge-to-edge obligatorio)
