CC = clang
CFLAGS = -g -O2 -Wall -fPIC -Wno-pointer-sign -MMD -MP
LDLIBS = -lsqlite3 -pthread

SRCDIR = lib
INCDIR = lib
OBJDIR = obj

SOURCES = $(shell find $(SRCDIR) -name '*.c')

OBJECTS = $(patsubst $(SRCDIR)/%.c,$(OBJDIR)/%.o,$(SOURCES))

DEPS = $(OBJECTS:.o=.d)

TARGET = .webs.dylib

BINS = bin/cli

all: $(TARGET) $(BINS)

$(TARGET): $(OBJECTS)
	@echo "LD $@"
	@$(CC) $(CFLAGS) -shared -o $@ $^ $(LDLIBS)

$(OBJDIR)/%.o: $(SRCDIR)/%.c
	@mkdir -p $(@D)
	@echo "CC $<"
	@$(CC) $(CFLAGS) -I$(INCDIR) -c $< -o $@

bin/%: bin/%.c $(TARGET)
	@echo "CC $@"
	@mkdir -p bin
	@$(CC) $(CFLAGS) -o $@ $< $(TARGET) -Wl,-rpath,@loader_path/.. $(LDLIBS)

clean:
	@echo "CLEAN"
	@rm -rf $(OBJDIR) $(TARGET) $(DEPS) $(BINS)

-include $(DEPS)

.PHONY: all clean

