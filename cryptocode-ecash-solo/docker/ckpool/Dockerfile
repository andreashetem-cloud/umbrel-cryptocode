FROM debian:bookworm-slim AS build

# CKPOOL_PR=11 bouwt vanaf pull/11/head: de fix voor Issue #10, waarbij de RTT
# network_diff na elke blokwissel minutenlang te hoog staat en test_blocksolve()
# een geldig blok stilzwijgend weggooit. Zet CKPOOL_PR="" om master te bouwen.
ARG CKPOOL_PR=11
ARG CKPOOL_REF=master

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential yasm autoconf automake libtool libzmq3-dev pkgconf \
        git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    git clone https://github.com/Bitcoin-ABC/ecash-ckpool-solo.git /src; \
    cd /src; \
    if [ -n "${CKPOOL_PR}" ]; then \
        git fetch origin "pull/${CKPOOL_PR}/head:ckfix"; \
        git checkout ckfix; \
    else \
        git checkout "${CKPOOL_REF}"; \
    fi; \
    git log -1 --format='ckpool build: %H %ad %s' > /src/BUILD_COMMIT; \
    cat /src/BUILD_COMMIT; \
    ./autogen.sh; \
    ./configure; \
    make -j"$(nproc)"

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
        libzmq5 curl jq util-linux ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /src/src/ckpool   /usr/local/bin/ckpool
COPY --from=build /src/src/notifier /usr/local/bin/notifier
COPY --from=build /src/BUILD_COMMIT /BUILD_COMMIT
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3333
ENTRYPOINT ["/entrypoint.sh"]
