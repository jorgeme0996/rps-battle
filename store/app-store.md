# RPS Battle · Ficha de App Store

Textos listos para copiar en App Store Connect (idioma principal: Español (México)).
Los límites de caracteres de Apple van entre paréntesis.

## Información de la app

- **Nombre** (30): `RPS Battle`
- **Subtítulo** (30): `Piedra, papel o tijera en 1v1`
- **Bundle ID**: `com.jorgeme0996.rpsbattle`
- **SKU**: `rps-battle-ios`
- **Categoría principal**: Juegos → **Estrategia**
- **Categoría secundaria**: Juegos → **Casual**
- **URL de la política de privacidad**: `https://rps-battle-production-7f46.up.railway.app/privacy.html`
- **URL de soporte**: `https://rps-battle-production-7f46.up.railway.app/support.html`
- **Copyright**: `2026 Jorge de Jesús Martinez Espino`

## Texto promocional (170)

```
¡Duelos 1v1 en tiempo real! Craftea piedra, papel o tijera, lánzalos por el carril correcto y destruye la base de tu rival. Juega con amigos con un solo enlace.
```

## Descripción (4000)

```
RPS Battle es piedra, papel o tijera como nunca lo habías jugado: en tiempo real, cara a cara y con estrategia.

En lugar de solo elegir una mano, CRAFTEAS tus piedras, papeles y tijeras y los LANZAS por tres carriles hacia el castillo de tu rival. Cuando dos objetos chocan, gana el de siempre: la piedra rompe la tijera, la tijera corta el papel y el papel envuelve la piedra. Cada objeto que llega a la base enemiga le quita 10 de vida.

Lee los movimientos de tu rival, defiende el carril correcto y rompe su defensa antes de que se acaben los 3 minutos.

CARACTERÍSTICAS
• Duelos 1 vs 1 en línea en tiempo real
• Juega con tus amigos con un enlace de invitación
• Revancha instantánea contra el mismo rival
• Siempre hay partida: si no hay nadie conectado, juegas contra un bot
• Tu apodo de Game Center, sin registros ni formularios
• Partidas rápidas de 3 minutos, perfectas para cualquier momento

¿Te atreves a retar a tus amigos?
```

## Palabras clave (100, separadas por comas, sin espacios)

```
piedra,papel,tijera,multijugador,duelo,online,estrategia,amigos,pvp,batalla,rps,casual,1v1
```

## Clasificación por edad (resultado esperado: 4+)

Responde **Ninguna** en todas las categorías de contenido. Además:
- Acceso web sin restricciones: **No**
- Contenido generado por usuarios / chat: **No** (el único texto de otros jugadores es su apodo)
- Concursos, apuestas: **No**

## Privacidad de la app (App Privacy)

- **¿Recopilas datos?** Sí
- **Tipos de datos**
  - Identificadores → **ID de dispositivo**: un ID aleatorio que crea la app (no es el IDFA).
  - Datos de uso → **Interacción con el producto**: eventos de juego (partidas, resultados, revanchas).
- **Para cada tipo**
  - Propósito: **Analítica**
  - ¿Vinculado a la identidad del usuario? **No**
  - ¿Se usa para rastreo? **No**
- El apodo de Game Center solo se usa en tiempo real para mostrarlo al rival y no se guarda, así que no hace falta declararlo.
- No hace falta el aviso de rastreo (App Tracking Transparency): la app no rastrea.

## Notas para el equipo de revisión (App Review)

```
RPS Battle is a real-time 1v1 multiplayer game. No account or login is required.

How to test alone: tap "¡JUGAR!". If no other player is online, you are matched against a bot after about 12 seconds, so a full match can be played by a single reviewer.

How to play: tap the two crafting steps of rock, paper or scissors; when the item is ready, tap it and then tap a lane to launch it toward the enemy castle.

Game Center is used only to show the player's alias; if the player is not signed in, a random name is assigned automatically.
```

## Pendientes

- [x] Capturas de pantalla de iPhone 6.9" (1320×2868) → `dist/app-store-screenshots/`, en este orden: 01 a 06
- [x] Correo de contacto en privacidad y soporte
- [ ] Activar Game Center para la app en App Store Connect
