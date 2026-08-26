# Spostare datahypotenus su un mini-PC Linux

Lo scenario previsto fin dall'inizio: oggi il PC di casa, domani un dispositivo Linux sempre
acceso, raggiungibile dalla rete locale.

## Perché è semplice

L'applicazione è un processo Node e una cartella di dati. Non ci sono dipendenze native da
ricompilare, servizi da installare, container da configurare.

## 1. Preparare il dispositivo

```bash
# Node 24+ (esempio con nodesource; va bene qualunque metodo)
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs git
node --version    # deve essere >= 24
```

## 2. Copiare il progetto

```bash
sudo mkdir -p /opt/datahypotenus
sudo chown $USER:$USER /opt/datahypotenus
# via git, oppure scp/rsync della cartella del progetto SENZA node_modules
rsync -a --exclude node_modules --exclude data/ ./ utente@minipc:/opt/datahypotenus/

cd /opt/datahypotenus
npm install
npm run build
```

## 3. Portare i dati

Sul vecchio computer, crea un backup (Impostazioni → Backup) e copia l'intera cartella `data/`:

```bash
rsync -a data/ utente@minipc:/var/lib/datahypotenus/
```

Oppure copia solo il backup più recente e ripristinalo dopo il primo avvio. In entrambi i casi
verifica subito che tutto ci sia:

```bash
npm run backup -- --list
npm run gc -- --check     # ogni allegato presente e integro
```

## 4. Configurare

```bash
sudo mkdir -p /var/lib/datahypotenus
sudo chown datahypotenus:datahypotenus /var/lib/datahypotenus

cat > /opt/datahypotenus/.env <<'EOF'
DH_DATA_DIR=/var/lib/datahypotenus
DH_HOST=0.0.0.0
DH_PORT=8787
DH_LOG_LEVEL=info
DH_AUTO_BACKUP_HOURS=24
DH_BACKUP_KEEP=20
EOF
```

> `DH_HOST=0.0.0.0` rende l'applicazione raggiungibile da tutti i dispositivi della rete
> locale. Leggi la sezione sulla sicurezza prima di lasciarlo così.

## 5. Servizio systemd

`/etc/systemd/system/datahypotenus.service`:

```ini
[Unit]
Description=datahypotenus - inventario di casa
After=network.target

[Service]
Type=simple
User=datahypotenus
Group=datahypotenus
WorkingDirectory=/opt/datahypotenus
ExecStart=/usr/bin/node server/src/index.ts
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

# Irrigidimento: il processo scrive solo dove serve.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/datahypotenus

[Install]
WantedBy=multi-user.target
```

```bash
sudo useradd --system --home /var/lib/datahypotenus --shell /usr/sbin/nologin datahypotenus
sudo chown -R datahypotenus:datahypotenus /var/lib/datahypotenus
sudo systemctl daemon-reload
sudo systemctl enable --now datahypotenus
sudo systemctl status datahypotenus
journalctl -u datahypotenus -f
```

L'applicazione risponde su `http://<ip-del-minipc>:8787`.

## 6. Backup automatico verso un NAS

Il backup interno gira all'avvio; per averne uno giornaliero anche a macchina sempre accesa,
basta una unit di timer:

`/etc/systemd/system/datahypotenus-backup.service`

```ini
[Unit]
Description=Backup di datahypotenus

[Service]
Type=oneshot
User=datahypotenus
WorkingDirectory=/opt/datahypotenus
ExecStart=/usr/bin/npm run backup
ExecStartPost=/usr/bin/rsync -a --delete /var/lib/datahypotenus/backups/ /mnt/nas/datahypotenus/
```

`/etc/systemd/system/datahypotenus-backup.timer`

```ini
[Unit]
Description=Backup giornaliero di datahypotenus

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl enable --now datahypotenus-backup.timer
```

## Sicurezza in rete locale

datahypotenus **non ha autenticazione**: chiunque raggiunga la porta vede e modifica
l'inventario. Finché ascolta su `127.0.0.1` non è un problema. Se lo esponi alla LAN:

1. **Non aprire la porta sul router.** Nessun port forwarding, nessun DMZ. Se serve accedere
   da fuori casa, usa una VPN (WireGuard, Tailscale): l'applicazione resta invisibile da
   internet.
2. **Limita l'accesso alla rete locale** con il firewall:

   ```bash
   sudo ufw allow from 192.168.1.0/24 to any port 8787 proto tcp
   sudo ufw enable
   ```

3. **Se vuoi una password**, mettila davanti con un reverse proxy — è la strada più semplice
   e non tocca il codice:

   ```nginx
   server {
     listen 80;
     server_name casa.local;

     auth_basic "datahypotenus";
     auth_basic_user_file /etc/nginx/.htpasswd;

     location / {
       proxy_pass http://127.0.0.1:8787;
       proxy_set_header Host $host;
       client_max_body_size 60M;   # deve superare DH_MAX_UPLOAD_MB
     }
   }
   ```

   In questo caso rimetti `DH_HOST=127.0.0.1`: solo nginx parla con l'applicazione.

## Aggiornare

```bash
cd /opt/datahypotenus
sudo systemctl stop datahypotenus
npm run backup            # sempre, prima di aggiornare
git pull                  # o ricopia i file
npm install
npm run build             # applica anche il controllo dei tipi
npm run migrate           # applica le eventuali nuove migrazioni
sudo systemctl start datahypotenus
```

Le migrazioni girano comunque all'avvio: `npm run migrate` serve per vederne l'esito prima.

## Uso da telefono e tablet

L'interfaccia è responsive: la barra laterale diventa un pannello a scomparsa, le liste si
compattano. Su iOS e Android si può aggiungere il sito alla schermata home per averlo come
un'app.

## Problemi frequenti

| Sintomo | Causa probabile |
|---|---|
| `Cannot find module 'node:sqlite'` | Node troppo vecchio: serve la 24 |
| `EACCES` sulla cartella dati | Proprietario sbagliato: `chown -R datahypotenus /var/lib/datahypotenus` |
| L'app parte ma il browser mostra la pagina di errore | Manca `npm run build` (interfaccia non compilata) |
| Non raggiungibile dalla LAN | `DH_HOST` è ancora `127.0.0.1`, o il firewall blocca la porta |
| Caricamento allegati fallisce dietro nginx | `client_max_body_size` troppo basso |
