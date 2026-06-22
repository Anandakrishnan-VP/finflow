from surya.settings import settings

print("Surya settings attributes:")
for attr in dir(settings):
    if not attr.startswith("_"):
        print(f"{attr}: {getattr(settings, attr)}")
