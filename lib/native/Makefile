CC = clang
CFLAGS = -g -O2 -Wall -fPIC -MMD -MP
SRCDIR = .
INCDIR = .
SOURCES = $(shell find $(SRCDIR)/src -name '*.c')
OBJECTS = $(SOURCES:.c=.o)
DEPS = $(OBJECTS:.o=.d)
TARGET = .webs.dylib

all: $(TARGET)

$(TARGET): $(OBJECTS)
	$(CC) $(CFLAGS) -shared -o $@ $^

%.o: %.c
	$(CC) $(CFLAGS) -I$(INCDIR) -c $< -o $@

clean:
	rm -f $(OBJECTS) $(TARGET) $(DEPS)

-include $(DEPS)

.PHONY: all clean

