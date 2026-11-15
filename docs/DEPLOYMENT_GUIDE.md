# Smart HR — Commercial Deployment & Architecture Guide

## 1. Customer & Multi-Organization Architecture Evaluation

To determine how Smart HR should be delivered across multiple commercial business customers, three delivery architectures were evaluated against operational, security, and financial criteria.

### 1.1 Architecture Options Evaluated

#### Approach A: Dedicated Single-Tenant Instance (Separate Application & Database per Customer)
Each customer organization receives their own isolated application instance and dedicated PostgreSQL database running on a provisioned virtual private server or shared host with process-level isolation.
- **Data Isolation**: Physical database isolation. Customer data cannot cross-contaminate even in the presence of application-level query bugs.
- **Compliance**: Simplifies compliance with the Philippine Data Privacy Act of 2012 (RA 10173). Audit logs and backups belong strictly to one legal entity.
- **Customization**: Individual clients can adopt customized statutory rules, corporate workweeks, and custom holiday schedules without affecting other organizations.

#### Approach B: Shared Multi-Tenant SaaS (Shared Application & Shared Database with `tenant_id`)
A single application server and central database serve all customers. Every database table includes a `tenant_id` foreign key, and global query scopes filter records by the active tenant.
- **Data Isolation**: Logical only. A single developer oversight, missing query scope, or raw SQL query risks catastrophic cross-tenant data leakage (e.g. Employee A seeing Company B's salary records).
- **Complexity**: High development overhead. Requires multi-tenant migration rewrites, tenant resolution middleware, tenant-aware cache prefixing, and complex queue isolation.
- **Operational Risk**: Noisy neighbor issues; one client's massive payroll calculation can degrade system responsiveness for all other tenants.

#### Approach C: Hybrid Architecture (Shared Application Workers with Isolated Database per Customer)
A shared stateless frontend and API pool that dynamically switches database connections based on subdomain or JWT tenant claim.
- **Complexity**: Moderate-to-high. Requires connection switching pooling, dynamic schema migrations, and elevated operational coordination.

---

### 1.2 Architectural Comparison Matrix

| Evaluation Dimension | Approach A: Dedicated Single-Tenant | Approach B: Shared Multi-Tenant SaaS | Approach C: Hybrid Architecture |
| :--- | :--- | :--- | :--- |
| **Development Complexity** | **Low**: Codebase is already single-tenant; zero architectural refactoring required. | **Very High**: Requires adding `tenant_id` to all tables, global scopes, and tenant routing. | **High**: Dynamic connection switching and database pool routing. |
| **Data Isolation & Privacy** | **Maximum**: Physical database isolation eliminates cross-tenant data leakage risks. | **Low**: A single query bug exposes confidential payroll data across clients. | **High**: Separate databases provide physical storage isolation. |
| **Hosting Expenses** | **Moderate**: $10–$25/month per customer on modern cloud VPS (Linode, DigitalOcean). | **Low**: Amortized infrastructure cost across all users ($2–$5/tenant). | **Moderate**: Shared compute with multiple managed databases. |
| **Backup & Point-in-Time Recovery** | **Simple**: Native `pg_dump` per client; client-specific restore takes minutes. | **Complex**: Restoring one tenant's corrupted data requires surgical row-level extraction. | **Moderate**: Dedicated database snapshots per customer. |
| **Software Updates & Rollbacks** | **Safe**: Staged, canary updates customer-by-customer; zero global downtime. | **High Risk**: An update bug impacts 100% of paying customers simultaneously. | **Moderate**: Staged database migrations, shared code deployment. |
| **Client Customization** | **High**: Company-specific shift rules or holidays can be tailored independently. | **Rigid**: All clients must conform to identical database schemas and policies. | **Moderate**: Shared code with client database overrides. |
| **Scalability** | Linear (scales to hundreds of customers using containerized/VPS fleets). | High concurrency efficiency for thousands of small tenants. | High concurrency efficiency with isolated storage. |

---

### 1.3 Architectural Recommendation: Managed Single-Tenant (Approach A)

**Smart HR officially recommends Approach A: Managed Single-Tenant Deployment.**

**Justification**:
1. **Confidentiality of Payroll Data**: In human resources and payroll software, salary details, tax identification numbers, and personal disciplinary records represent highly sensitive personal information. Philippine enterprise clients demand guarantees that their payroll data is physically separated from competitor data.
2. **Alignment with Existing Codebase**: The existing Smart HR architecture is completely stable, thoroughly tested, and operates cleanly without the overhead of tenant IDs or global scopes.
3. **Operational Safety**: Backups, restores, statutory rule versioning, and database maintenance can be scheduled according to each client's specific payroll calendar (e.g. avoiding maintenance during their 15th and 30th payroll cutoffs).
4. **Economic Viability**: With cloud VPS instances available at $10–$20/month (e.g. Linode 2GB/4GB or DigitalOcean Droplets), a subscription price of PHP 2,490 to PHP 5,990/month easily achieves 75% to 85% gross margins per customer.

---

## 2. Production Server Specification & Provisioning

### 2.1 Recommended Virtual Machine Sizing (Per 50–150 Employees)

- **Operating System**: Ubuntu 24.04 LTS or Debian 12 (Bookworm)
- **Virtual CPU**: 2 vCPUs
- **System Memory**: 4 GB RAM
- **Storage**: 40 GB NVMe SSD
- **Network**: Dedicated IPv4 with TLS/SSL certificate (Let's Encrypt / Cloudflare)

### 2.2 System Package Installation

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y software-properties-common curl git unzip nginx supervisor ufw

# Install PHP 8.4 and required extensions
sudo add-apt-repository ppa:ondrej/php -y
sudo apt update
sudo apt install -y php8.4-fpm php8.4-cli php8.4-pgsql php8.4-mbstring \
  php8.4-xml php8.4-curl php8.4-bcmath php8.4-gd php8.4-intl php8.4-zip

# Install PostgreSQL 16
sudo apt install -y postgresql postgresql-contrib

# Install Node.js 20 LTS (for production building if compiling on-host)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

---

## 3. Web Server & Reverse Proxy Configuration (Nginx)

Create `/etc/nginx/sites-available/smarthr.conf`:

```nginx
# HTTP - Redirect all traffic to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name hr.customerdomain.com api.customerdomain.com;
    return 301 https://$host$request_uri;
}

# HTTPS - Application Server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name hr.customerdomain.com;

    ssl_certificate /etc/letsencrypt/live/hr.customerdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/hr.customerdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self' https://api.customerdomain.com;" always;

    root /var/www/smarthr/client/dist;
    index index.html;

    # Single Page Application fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Static asset caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, no-transform";
    }
}

# HTTPS - Backend API Server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name api.customerdomain.com;

    ssl_certificate /etc/letsencrypt/live/hr.customerdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/hr.customerdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    root /var/www/smarthr/server/public;
    index index.php;

    # API Request size limit
    client_max_body_size 10M;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php8.4-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
        fastcgi_hide_header X-Powered-By;
    }

    location ~ /\.(?!well-known).* {
        deny all;
    }
}
```

Enable the configuration:
```bash
sudo ln -s /etc/nginx/sites-available/smarthr.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## 4. Production Application Deployment Commands

```bash
# 1. Clone repository to web root
sudo git clone https://github.com/your-org/enterprise-hr-management.git /var/www/smarthr
sudo chown -R www-data:www-data /var/www/smarthr
sudo chmod -R 775 /var/www/smarthr/server/storage /var/www/smarthr/server/bootstrap/cache

# 2. Deploy Backend
cd /var/www/smarthr/server
sudo -u www-data composer install --no-dev --optimize-autoloader
sudo -u www-data cp .env.production .env
sudo -u www-data php artisan key:generate --force
sudo -u www-data php artisan migrate --force
sudo -u www-data php artisan db:seed --class=StatutoryRuleSeeder --force
sudo -u www-data php artisan config:cache
sudo -u www-data php artisan route:cache
sudo -u www-data php artisan view:cache

# 3. Deploy Frontend
cd /var/www/smarthr/client
npm ci
npm run build

# 4. Verify Readiness
curl -fsS https://api.customerdomain.com/api/health
```

