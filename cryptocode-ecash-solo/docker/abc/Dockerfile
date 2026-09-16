FROM debian:bookworm-slim

ARG ABC_VERSION=0.33.9
# Optioneel: vul de sha256 uit https://download.bitcoinabc.org/<versie>/ in.
# Leeg = geen checksum-verificatie (build werkt, maar minder streng).
ARG ABC_SHA256=""

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates wget libstdc++6 libgcc-s1 libatomic1 util-linux \
    && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    url="https://download.bitcoinabc.org/${ABC_VERSION}/linux/bitcoin-abc-${ABC_VERSION}-x86_64-linux-gnu.tar.gz"; \
    wget -q -O /tmp/abc.tar.gz "$url"; \
    if [ -n "$ABC_SHA256" ]; then echo "${ABC_SHA256}  /tmp/abc.tar.gz" | sha256sum -c -; fi; \
    tar -xzf /tmp/abc.tar.gz -C /opt; \
    rm /tmp/abc.tar.gz; \
    for b in /opt/bitcoin-abc-${ABC_VERSION}/bin/*; do ln -sf "$b" /usr/local/bin/; done; \
    bitcoind --version

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8332 8433 28332
VOLUME /data
ENTRYPOINT ["/entrypoint.sh"]
