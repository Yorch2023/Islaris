FROM bitnami/moodle:latest

# Copy PHAROS-AI plugins and theme into the Moodle image.
# Bitnami copies /opt/bitnami/moodle → /bitnami/moodle on first boot,
# so plugins placed here are included in that initial copy.
COPY --chown=daemon:daemon moodle-plugins/block_pharos_tutor     /opt/bitnami/moodle/blocks/pharos_tutor
COPY --chown=daemon:daemon moodle-plugins/block_pharos_teacher   /opt/bitnami/moodle/blocks/pharos_teacher
COPY --chown=daemon:daemon moodle-plugins/block_pharos_community /opt/bitnami/moodle/blocks/pharos_community
COPY --chown=daemon:daemon moodle-plugins/mod_pharos_itinerary   /opt/bitnami/moodle/mod/pharos_itinerary
COPY --chown=daemon:daemon moodle-plugins/mod_pharos_badges      /opt/bitnami/moodle/mod/pharos_badges
COPY --chown=daemon:daemon moodle-theme                          /opt/bitnami/moodle/theme/pharos
