# syntax=docker/dockerfile:1
#
# METNEX Jasper Renderer — internal-only Jasper Reports HTTP render service (TASK-022.5).
# Multi-stage: Maven build stage produces the Spring Boot fat jar, runtime stage ships only a
# minimal JRE + that jar (no Maven, no build toolchain, no source in the final image).

FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build

# Build context is the repository root (see infra/docker/docker-compose*.yml), so source paths
# are prefixed with services/jasper-renderer/.
#
# Dependency layer cached separately from source so `mvn package` only re-resolves deps when
# pom.xml actually changes.
COPY services/jasper-renderer/pom.xml .
RUN --mount=type=cache,target=/root/.m2 mvn -B -q dependency:go-offline

COPY services/jasper-renderer/src ./src
RUN --mount=type=cache,target=/root/.m2 mvn -B -q package -DskipTests

FROM eclipse-temurin:21-jre-alpine AS runtime

RUN addgroup -S renderer && adduser -S renderer -G renderer
WORKDIR /app
COPY --from=build /build/target/jasper-renderer.jar /app/jasper-renderer.jar
RUN chown -R renderer:renderer /app
USER renderer

EXPOSE 8088

# JVM heap is environment-tunable without rebuilding the image; keep a sane bounded default for
# containers without an explicit memory limit override at the compose/stack level.
ENV JAVA_OPTS="-Xms128m -Xmx384m"

HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=30s \
  CMD wget -qO- http://127.0.0.1:8088/health || exit 1

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/jasper-renderer.jar"]
