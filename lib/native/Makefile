CC = clang
TARGET = .webs.dylib

# Add the new hash table source files to the include path and sources list
CFLAGS = -fPIC -g -Isrc/core -Isrc/codecs -Isrc/api
LDFLAGS = -shared

CORE_SOURCES = src/core/webs_value.c src/core/webs_hash.c
CODEC_SOURCES = src/codecs/webs_codec_json.c
API_SOURCES = src/api/webs_api.c

# Removed the unused SAX_SOURCES variable for clarity
ALL_SOURCES = $(CORE_SOURCES) $(CODEC_SOURCES) $(API_SOURCES)

ALL_OBJECTS = $(ALL_SOURCES:.c=.o)

# Default target
all: $(TARGET)

# Link all object files into the final shared library
$(TARGET): $(ALL_OBJECTS)
	$(CC) $(LDFLAGS) -o $@ $^

# Generic rule to compile any .c file into a .o file
%.o: %.c
	$(CC) $(CFLAGS) -c $< -o $@

# Clean up build artifacts
clean:
	rm -f $(TARGET) $(ALL_OBJECTS)

# Declare targets that are not files
.PHONY: all clean

