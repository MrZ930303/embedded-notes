/* Original teaching layout. NOT BOOTABLE: no vector table, no runtime setup. */
ENTRY(lesson_entry)
MEMORY
{
    FLASH (rx) : ORIGIN = 0x08000000, LENGTH = 16K
    RAM (rw) : ORIGIN = 0x20000000, LENGTH = 4K
}
SECTIONS
{
    .text : { *(.text*) *(.rodata*) } > FLASH
    .note.gnu.build-id : { *(.note.gnu.build-id) } > FLASH
    .data : { *(.data*) } > RAM AT > FLASH
    .bss (NOLOAD) : { *(.bss*) *(COMMON) } > RAM
    /DISCARD/ : { *(.comment) *(.ARM.exidx*) *(.ARM.extab*) }
}
