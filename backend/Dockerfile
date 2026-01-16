# Basis-Image: Schlankes Python
FROM python:3.11-slim

# Environment Variablen setzen (Wichtig für Python in Containern)
# PYTHONDONTWRITEBYTECODE: Verhindert .pyc Dateien (unnötig im Container)
# PYTHONUNBUFFERED: Logs erscheinen sofort in Portainer (wichtig fürs Debuggen!)
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Dependencies installieren
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Code kopieren
COPY . .

# User anlegen (Sicherheit: Nie als Root laufen lassen, auch nicht im Container!)
RUN adduser --disabled-password --gecos '' appuser
USER appuser

# Startbefehl
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]