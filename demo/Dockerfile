FROM golang:1.25-bookworm AS build

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY demo ./demo

RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -o /out/payment ./demo/services/payment
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -o /out/inventory ./demo/services/inventory
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -o /out/notification ./demo/services/notification

FROM scratch

COPY --from=build /out/payment /payment
COPY --from=build /out/inventory /inventory
COPY --from=build /out/notification /notification
