#!/bin/sh

apk add --no-cache git;
git clone --branch=main --depth=1 https://github.com/mckaywrigley/chatbot-ui;
mkdir db && cp -r chatbot-ui/supabase/migrations /db/;
for file in /db/migrations/*.sql; do sed -i -e '1s,^,-- migrate\:up\n,' "$file"; echo "-- migrate:down" >> "$file"; done;
sed -i -e "s,http://supabase_kong_chatbotui:8000,${KONG_URL}," \
    -e "s/eyJ.*1IU/${SERVICE_KEY}/" /db/migrations/20240108234540_setup.sql
/usr/local/bin/dbmate up;
