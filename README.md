# Simulador Geiger‑Müller

Simulador mobile-first de La Movida de SST Plus para formación ocupacional en detección de radiación ionizante: contaminación superficial, presencia y tasa de dosis, búsqueda de fuentes y verificación del índice de transporte.

Sitio: https://geiger.movidasst.com

## Desarrollo

```bash
npm ci
npm run dev
npm run build
```

La rama `main` publica el sitio mediante GitHub Pages. Cada cambio debe superar la verificación automática de compilación y el análisis CodeQL.

## Seguridad y privacidad

El cliente utiliza una clave **publicable** de Supabase; no es un secreto. El acceso debe quedar protegido por permisos mínimos del RPC y límites de intentos en el servidor. No se deben incorporar claves `service_role`, secretos ni datos personales al código.

Las vulnerabilidades se reportan de forma privada según [SECURITY.md](SECURITY.md).

## Licencia, autoría y marca

Copyright © 2026 David Linares Brea — La Movida de SST Plus.

El código se distribuye bajo [GNU AGPL‑3.0-or-later](LICENSE). Las modificaciones utilizadas a través de una red deben ofrecer a sus usuarios el código fuente correspondiente en los términos de la licencia.

La licencia del código **no autoriza** el uso de las marcas, logotipos ni identidad de La Movida de SST Plus. Consulta [TRADEMARKS.md](TRADEMARKS.md) y [NOTICE.md](NOTICE.md).

Contribuciones: [CONTRIBUTING.md](CONTRIBUTING.md).
