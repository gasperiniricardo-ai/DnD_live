# Aster Valion — Despliegue en EC2 con CI/CD

Este proyecto sustituye el `window.storage` de los artifacts de Claude por un
backend real (Express + SQLite), listo para desplegarse en una instancia EC2
con despliegue automático en cada `git push` a `main`.

```
aster-app/
├── server/          Backend Express + SQLite
├── public/          Frontend (index.html, tal cual la app de personajes/sesiones)
├── deploy/
│   ├── ec2-setup.sh   Provisión inicial de la instancia (se ejecuta UNA vez)
│   └── redeploy.sh    Script que corre GitHub Actions en cada push
└── .github/workflows/deploy.yml   Pipeline de CI/CD
```

## 1. Sube este proyecto a tu repositorio de GitHub

```bash
cd aster-app
git init   # si el repo no está ya inicializado aquí
git remote add origin <URL_DE_TU_REPO>   # si no existe aún el remote
git add .
git commit -m "App con backend Express/SQLite lista para EC2"
git push -u origin main
```

## 2. Lanza la instancia EC2 (lo haces tú, en la consola o con la CLI)

- AMI: **Ubuntu 22.04 or 24.04 LTS**
- Tipo: `t3.micro` es de sobra para una mesa de juego
- Security Group: abre los puertos
  - `22` (SSH) — solo desde tu IP si puedes
  - `80` (HTTP) — desde `0.0.0.0/0`
- Crea o reutiliza un **key pair** (lo necesitarás para SSH y para el secreto de GitHub)
- (Opcional) Asigna una **Elastic IP** para que la IP no cambie si reinicias la instancia

Ejemplo con AWS CLI:
```bash
aws ec2 run-instances \
  --image-id ami-xxxxxxxx \
  --instance-type t3.micro \
  --key-name tu-keypair \
  --security-group-ids sg-xxxxxxxx \
  --subnet-id subnet-xxxxxxxx \
  --count 1
```

## 3. Provisiona la instancia (una sola vez)

Copia el script y ejecútalo por SSH:

```bash
scp -i tu-keypair.pem deploy/ec2-setup.sh ubuntu@<IP_PUBLICA>:~/
ssh -i tu-keypair.pem ubuntu@<IP_PUBLICA>
chmod +x ec2-setup.sh
./ec2-setup.sh git@github.com:tu-usuario/tu-repo.git
```

Esto instala Node 20, PM2, Nginx, clona el repo en `/home/ubuntu/aster-app`,
arranca la app con PM2 y configura Nginx como proxy inverso en el puerto 80.

> Si el repo es privado y clonas por SSH, necesitarás añadir una **deploy key**
> de GitHub a la instancia (`ssh-keygen` en el EC2, y pegar la pública en
> GitHub → Settings → Deploy keys). Si el repo es público, puedes clonar por
> HTTPS sin configurar nada extra.

Al terminar, abre `http://<IP_PUBLICA>/` en el navegador — deberías ver la app.

## 4. Configura el CI/CD en GitHub (para ver los cambios en tiempo real)

En tu repo de GitHub: **Settings → Secrets and variables → Actions → New repository secret**

| Secreto        | Valor                                             |
|-----------------|----------------------------------------------------|
| `EC2_HOST`      | La IP pública (o dominio) de tu instancia          |
| `EC2_USER`      | `ubuntu`                                           |
| `EC2_SSH_KEY`   | El contenido completo de tu `tu-keypair.pem`       |

El workflow (`.github/workflows/deploy.yml`) ya está incluido: cada vez que
hagas `git push` a `main`, GitHub Actions se conecta por SSH a tu EC2 y ejecuta
`deploy/redeploy.sh`, que hace `git pull` + `npm ci` + `pm2 restart`. En unos
15-30 segundos después del push, el cambio está en vivo.

## 5. Flujo de trabajo día a día

1. Yo modifico el código aquí en la conversación.
2. Tú (o yo, si me das acceso a tu repo) hace `git push`.
3. GitHub Actions despliega automáticamente.
4. Refrescas `http://<IP_PUBLICA>/` y ves el cambio.

## Notas y límites

- **HTTPS**: de momento el proxy es HTTP puro. Si quieres TLS, lo más simple
  es apuntar un dominio a la Elastic IP y usar `certbot` con Nginx
  (puedo prepararte ese paso cuando tengas el dominio).
- **Base de datos**: SQLite vive en `aster-app/data/aster.db` en el propio
  EC2. Para esta escala (una mesa de rol) es más que suficiente; no necesitas
  RDS.
- **Backups**: si te importa no perder personajes, programa un cron simple
  que copie `data/aster.db` a S3 cada noche — puedo escribírtelo si quieres.
- **Multi-instancia**: si en el futuro quisieras más de un EC2 detrás de un
  load balancer, SQLite dejaría de valer y habría que migrar a RDS Postgres;
  avísame si llegas a ese punto.
