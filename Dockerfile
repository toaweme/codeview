FROM alpine:3.22

ARG TARGETPLATFORM

RUN apk add --no-cache git \
    && git config --system --add safe.directory '*' \
    && adduser -D -H -u 10001 codeview

COPY $TARGETPLATFORM/codeview /usr/local/bin/codeview

USER codeview

ENV CODEVIEW_DIR=/repos
ENV CODEVIEW_HOST=0.0.0.0
ENV CODEVIEW_PORT=8080

ENTRYPOINT ["/usr/local/bin/codeview"]

CMD ["serve"]
