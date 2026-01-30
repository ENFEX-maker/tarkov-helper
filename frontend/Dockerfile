FROM nginx:alpine

# Lösche die Standard-Nginx-Seite
RUN rm -rf /usr/share/nginx/html/*

# WICHTIG: Der Punkt (.) bedeutet "Alles in diesem Ordner".
# Damit werden index.html UND der maps-Ordner kopiert.
COPY . /usr/share/nginx/html

# Custom Nginx Config kopieren
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Port freigeben
EXPOSE 80

# Nginx starten
CMD ["nginx", "-g", "daemon off;"]